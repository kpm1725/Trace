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


async def grant_credits(db, user_id: str, credits: int):
    await db.users.update_one({"user_id": user_id}, {"$inc": {"paid_credits": credits}}, upsert=False)
    log.info("Granted %d credits to user %s", credits, user_id)


async def set_unlimited_until(db, user_id: str, until: datetime):
    await db.users.update_one({"user_id": user_id}, {"$set": {"unlimited_until": until}}, upsert=False)
    log.info("Set unlimited access for user %s until %s", user_id, until)


async def event_already_processed(db, event_id: str) -> bool:
    existing = await db.billing_events.find_one({"event_id": event_id})
    return existing is not None


async def mark_event_processed(db, event_id: str, event_type: str, app_user_id: str):
    await db.billing_events.update_one(
        {"event_id": event_id},
        {"$set": {"event_id": event_id, "type": event_type, "app_user_id": app_user_id, "received_at": now_utc()}},
        upsert=True,
    )


async def handle_revenuecat_event(db, event: dict) -> Optional[str]:
    """Apply a RevenueCat webhook event. Idempotent on event['id'].
    Returns a short status string for logging, or None if ignored.

    NOTE: exact field names (app_user_id, product_id, expiration_at_ms, type
    values) follow RevenueCat's documented webhook schema as of integration
    time — re-check against the RevenueCat dashboard's sample payload if
    events aren't landing as expected, since webhook schemas do evolve.
    """
    event_id = event.get("id")
    event_type = event.get("type")
    app_user_id = event.get("app_user_id")
    product_id = event.get("product_id")

    if not event_id or not app_user_id:
        log.warning("Ignoring malformed RevenueCat event: %s", event)
        return None

    if await event_already_processed(db, event_id):
        return "duplicate"

    if event_type in ("INITIAL_PURCHASE", "NON_RENEWING_PURCHASE"):
        if product_id in CREDIT_PRODUCTS:
            await grant_credits(db, app_user_id, CREDIT_PRODUCTS[product_id])
        elif product_id == UNLIMITED_PRODUCT_ID:
            exp_ms = event.get("expiration_at_ms")
            if exp_ms:
                await set_unlimited_until(db, app_user_id, datetime.fromtimestamp(exp_ms / 1000, tz=timezone.utc))
    elif event_type == "RENEWAL":
        if product_id == UNLIMITED_PRODUCT_ID:
            exp_ms = event.get("expiration_at_ms")
            if exp_ms:
                await set_unlimited_until(db, app_user_id, datetime.fromtimestamp(exp_ms / 1000, tz=timezone.utc))
    elif event_type in ("CANCELLATION", "EXPIRATION", "BILLING_ISSUE"):
        # Cancellation just means "won't renew" — access stays valid until the
        # already-recorded unlimited_until timestamp naturally lapses. Log only.
        log.info("Subscription %s for user %s (product %s)", event_type, app_user_id, product_id)
    else:
        log.info("Unhandled RevenueCat event type: %s", event_type)

    await mark_event_processed(db, event_id, event_type, app_user_id)
    return event_type
