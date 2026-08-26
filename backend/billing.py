"""
billing.py — Credit-based billing for Trace, backed by RevenueCat.

Billing unit: 1 credit = 1 AI action (one photo-debug OR one prompt-generation).
Both are single, comparably-sized Claude calls — unlike Scribe's long-manuscript
chunking, there's no natural sub-unit to meter more finely than "one action",
so a single unified credit pool covers both features.

Free tier: 5 credits per account (lifetime).
Paid: consumable credit packs, or an unlimited monthly pass — both purchased as
native IAP products through RevenueCat (see src/context/BillingContext.tsx and
README.md for why RevenueCat instead of raw react-native-iap/expo-iap).

RevenueCat product IDs must be created to match CREDIT_PRODUCTS / UNLIMITED_PRODUCT_ID
in the RevenueCat dashboard (mapped to real App Store Connect / Play Console
in-app products of the same underlying SKUs).
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

log = logging.getLogger("trace.billing")

FREE_CREDITS = 5

# product_id -> credits granted per purchase (consumable, can be bought repeatedly)
CREDIT_PRODUCTS = {
    "trace_credits_10": 10,   # $2.99
    "trace_credits_40": 40,   # $8.99 — better per-credit value
}
UNLIMITED_PRODUCT_ID = "trace_unlimited_monthly"  # $9.99/mo, auto-renewing


def now_utc():
    return datetime.now(timezone.utc)


async def get_entitlement(db, user_id: str) -> dict:
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        return {
            "free_credits_used": 0, "free_credits_remaining": FREE_CREDITS,
            "paid_credits": 0, "total_available": FREE_CREDITS,
            "is_unlimited": False, "unlimited_until": None,
        }

    free_used = int(u.get("free_credits_used", 0))
    free_remaining = max(0, FREE_CREDITS - free_used)
    paid_credits = int(u.get("paid_credits", 0))

    until = u.get("unlimited_until")
    is_unlimited = False
    if until:
        until = until if until.tzinfo else until.replace(tzinfo=timezone.utc)
        is_unlimited = until > now_utc()

    return {
        "free_credits_used": free_used,
        "free_credits_remaining": free_remaining,
        "paid_credits": paid_credits,
        "total_available": free_remaining + paid_credits,
        "is_unlimited": is_unlimited,
        "unlimited_until": until.isoformat() if until else None,
    }


async def consume_credit(db, user_id: str) -> dict:
    """Consume 1 credit for a debug/generate action.
    No-op if the user has an active unlimited pass. Raises 402 if out of credits."""
    ent = await get_entitlement(db, user_id)

    if ent["is_unlimited"]:
        return {"free_consumed": 0, "paid_consumed": 0, "unlimited": True}

    if ent["total_available"] < 1:
        raise HTTPException(status_code=402, detail={
            "code": "insufficient_credits",
            "message": "Out of credits. Buy a credit pack or go unlimited to keep debugging.",
            "available": ent["total_available"],
        })

    if ent["free_credits_remaining"] > 0:
        await db.users.update_one({"user_id": user_id}, {"$inc": {"free_credits_used": 1}})
        return {"free_consumed": 1, "paid_consumed": 0, "unlimited": False}

    await db.users.update_one({"user_id": user_id}, {"$inc": {"paid_credits": -1}})
    return {"free_consumed": 0, "paid_consumed": 1, "unlimited": False}


async def grant_credits(db, user_id: str, credits: int) -> bool:
    """Returns False if no such user — caller must not treat that as success."""
    res = await db.users.update_one({"user_id": user_id}, {"$inc": {"paid_credits": credits}})
    if res.matched_count == 0:
        return False
    log.info("Granted %d credits to user %s", credits, user_id)
    return True


async def set_unlimited_until(db, user_id: str, until: datetime) -> bool:
    """Returns False if no such user — caller must not treat that as success."""
    res = await db.users.update_one({"user_id": user_id}, {"$set": {"unlimited_until": until}})
    if res.matched_count == 0:
        return False
    log.info("Set unlimited access for user %s until %s", user_id, until)
    return True


def _expiry_from(event: dict) -> Optional[datetime]:
    exp_ms = event.get("expiration_at_ms")
    return datetime.fromtimestamp(exp_ms / 1000, tz=timezone.utc) if exp_ms else None


async def _apply_event(db, event: dict) -> str:
    """Apply one event's effect. Returns a status string; "unknown_user" means
    the purchase is real but we have no such user yet, so it must be parked
    rather than dropped."""
    event_type = event.get("type")
    app_user_id = event.get("app_user_id")
    product_id = event.get("product_id")

    if event_type in ("INITIAL_PURCHASE", "NON_RENEWING_PURCHASE", "RENEWAL", "UNCANCELLATION"):
        if product_id in CREDIT_PRODUCTS:
            # Renewals/uncancellations of a consumable shouldn't happen, but if
            # they do, granting again is the safe direction (user paid again).
            ok = await grant_credits(db, app_user_id, CREDIT_PRODUCTS[product_id])
            return "credits_granted" if ok else "unknown_user"
        if product_id == UNLIMITED_PRODUCT_ID:
            until = _expiry_from(event)
            if not until:
                log.warning("Unlimited purchase %s had no expiration_at_ms", event.get("id"))
                return "missing_expiry"
            ok = await set_unlimited_until(db, app_user_id, until)
            return "unlimited_set" if ok else "unknown_user"
        log.info("Purchase of unrecognized product_id %r — no entitlement mapped", product_id)
        return "unmapped_product"

    if event_type in ("CANCELLATION", "EXPIRATION", "BILLING_ISSUE"):
        # Cancellation just means "won't renew" — access stays valid until the
        # already-recorded unlimited_until timestamp naturally lapses. Log only.
        log.info("Subscription %s for user %s (product %s)", event_type, app_user_id, product_id)
        return "noted"

    log.info("Unhandled RevenueCat event type: %s", event_type)
    return "ignored"


async def handle_revenuecat_event(db, event: dict) -> str:
    """Apply a RevenueCat webhook event. Idempotent on event['id'].

    Concurrency: the claim below is an atomic insert against a unique index on
    event_id, not a read-then-write, so two simultaneous deliveries of the same
    event can't both pass the duplicate check and double-credit.

    Durability: an event for a user_id we don't have is parked in
    pending_billing_events rather than silently dropped — otherwise a real
    purchase evaporates and the idempotency marker stops it ever being retried.
    reconcile_pending_events() replays those once the user exists.

    NOTE: exact field names (app_user_id, product_id, expiration_at_ms, type
    values) follow RevenueCat's documented webhook schema as of integration
    time — re-check against the RevenueCat dashboard's sample payload if
    events aren't landing as expected, since webhook schemas do evolve.
    """
    event_id = event.get("id")
    app_user_id = event.get("app_user_id")

    if not event_id or not app_user_id:
        log.warning("Ignoring malformed RevenueCat event: %s", event)
        return "malformed"

    # Atomically claim the event. Unique index on event_id is what makes this safe.
    try:
        await db.billing_events.insert_one({
            "event_id": event_id, "type": event.get("type"),
            "app_user_id": app_user_id, "product_id": event.get("product_id"),
            "status": "processing", "received_at": now_utc(),
        })
    except DuplicateKeyError:
        return "duplicate"

    try:
        status = await _apply_event(db, event)
    except Exception:
        # Release the claim so RevenueCat's retry can legitimately redo this.
        await db.billing_events.delete_one({"event_id": event_id})
        raise

    if status == "unknown_user":
        log.error(
            "RevenueCat event %s is for unknown user %s — parking for reconciliation",
            event_id, app_user_id,
        )
        await db.pending_billing_events.insert_one({
            "event_id": event_id, "app_user_id": app_user_id,
            "event": event, "parked_at": now_utc(),
        })

    await db.billing_events.update_one(
        {"event_id": event_id}, {"$set": {"status": status, "processed_at": now_utc()}}
    )
    return status


async def reconcile_pending_events(db, user_id: str) -> int:
    """Replay any events parked for this user (e.g. a purchase whose webhook
    landed before the account existed). Returns how many were applied."""
    applied = 0
    cursor = db.pending_billing_events.find({"app_user_id": user_id})
    for parked in await cursor.to_list(100):
        status = await _apply_event(db, parked["event"])
        if status == "unknown_user":
            continue  # still not resolvable; leave parked
        await db.pending_billing_events.delete_one({"event_id": parked["event_id"]})
        await db.billing_events.update_one(
            {"event_id": parked["event_id"]},
            {"$set": {"status": f"reconciled:{status}", "processed_at": now_utc()}},
        )
        applied += 1
    if applied:
        log.info("Reconciled %d parked billing event(s) for user %s", applied, user_id)
    return applied
