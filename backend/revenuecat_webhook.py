"""RevenueCat webhook — server-side fulfilment of native in-app purchases.

Purchases happen natively on the device through RevenueCat, which wraps Apple
IAP and Google Play Billing. The app never tells this server what was bought;
RevenueCat does, by POSTing here. That is the whole reason fulfilment is
server-side: a client that could assert its own entitlements is a client that
can grant itself unlimited credits.

Three details are easy to get wrong and expensive when they are:

  - `base_product_id` strips Google Play's `:basePlanId` suffix. Play identifies
    a subscription as `productId:basePlanId` and RevenueCat passes that through,
    so `trace_unlimited_monthly` arrives as `trace_unlimited_monthly:monthly`
    and matches no grant table keyed on the bare id — the purchase is charged
    and never credited. The client normalises identically in
    `frontend/src/billing/products.ts`.

  - A delivery that credits nothing is kept `fulfilled: False` with a reason
    rather than being retired. Marking it fulfilled would permanently and
    silently discard a purchase the user paid for.

  - An unknown user gets a 503, not a 2xx. A 2xx retires the event; RevenueCat
    would never retry, and the buyer would be charged and never credited.

The grant tables below are one half of a two-sided contract; the other is
`frontend/src/billing/products.ts`. A product missing from either side can never
be bought or never be credited, so the two lists must stay in step.

Credits are a single weighted pool (see billing.py), which is why one pack grant
covers both features rather than there being a debug pack and a generate pack.
"""
import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Header, HTTPException, Request
from pymongo.errors import DuplicateKeyError

router = APIRouter()
log = logging.getLogger("trace")

REVENUECAT_WEBHOOK_AUTH = os.environ.get("REVENUECAT_WEBHOOK_AUTH", "")

FULFILLABLE_EVENTS = ("INITIAL_PURCHASE", "RENEWAL", "NON_RENEWING_PURCHASE")

# Subscriptions carry their own expiry, so replaying one is harmless.
SUBSCRIPTION_GRANTS = {
    "trace_unlimited_monthly": "trace_unlimited_until",
    "trace_unlimited_annual": "trace_unlimited_until",
}

# Consumables accumulate. Replaying one hands out free credits, which is what
# the event_id claim below exists to prevent.
CONSUMABLE_GRANTS = {
    "credits_10": ("paid_credits", 10),
    "credits_25": ("paid_credits", 25),
    "credits_60": ("paid_credits", 60),
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def ms_to_datetime(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc)


def base_product_id(product_id: str) -> str:
    """Strip Google Play's `:basePlanId` suffix from a subscription id."""
    return product_id.split(":")[0]


def compute_grant(product_id: str, event: Dict[str, Any]):
    """Decide what a purchase credits.

    Returns `(update_doc, None)` for a grantable purchase, or `(None, reason)`
    when nothing can be credited.
    """
    base_id = base_product_id(product_id)
    if base_id in SUBSCRIPTION_GRANTS:
        exp_ms = event.get("expiration_at_ms")
        if not exp_ms:
            # Granting without an expiry would mean inventing one.
            return None, "missing_expiration"
        return {"$set": {SUBSCRIPTION_GRANTS[base_id]: ms_to_datetime(exp_ms)}}, None
    if base_id in CONSUMABLE_GRANTS:
        field, amount = CONSUMABLE_GRANTS[base_id]
        return {"$inc": {field: amount}}, None
    return None, "unknown_product"


async def ensure_indexes(db):
    """Create the unique index the replay guard depends on.

    Failing to create it must not take the API down, but it does mean
    concurrent redeliveries could double-grant, so say so loudly.
    """
    try:
        await db.revenuecat_events.create_index("event_id", unique=True)
    except Exception as e:
        log.error("Could not create unique index on revenuecat_events.event_id "
                  "— duplicate webhook deliveries may double-grant: %s", e)


def _event_key(event: Dict[str, Any]) -> str:
    """RevenueCat always sends an event id; derive a stable one if it ever
    doesn't, since several events keyed on None would collide under the unique
    index and be mistaken for replays of each other."""
    eid = event.get("id")
    if eid:
        return str(eid)
    parts = [
        str(event.get("app_user_id", "")),
        str(event.get("product_id", "")),
        str(event.get("type", "")),
        str(event.get("purchased_at_ms") or event.get("event_timestamp_ms") or ""),
    ]
    return "derived:" + hashlib.sha256("|".join(parts).encode()).hexdigest()


async def _mark_fulfilled(db, event_key: str):
    await db.revenuecat_events.update_one(
        {"event_id": event_key},
        {"$set": {"fulfilled": True, "fulfilled_at": now_utc()},
         "$unset": {"unfulfilled_reason": ""}},
    )


async def _mark_unfulfilled(db, event_key: str, reason: str):
    """Record that a purchase arrived but granted nothing.

    Kept visible and retryable rather than retired — see the module docstring.
    """
    await db.revenuecat_events.update_one(
        {"event_id": event_key},
        {"$set": {"fulfilled": False, "unfulfilled_reason": reason,
                  "unfulfilled_at": now_utc()}},
    )


@router.post("/revenuecat")
async def revenuecat_webhook(request: Request, authorization: Optional[str] = Header(None)):
    if REVENUECAT_WEBHOOK_AUTH and authorization != f"Bearer {REVENUECAT_WEBHOOK_AUTH}":
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        payload = await request.json()
    except Exception as e:
        log.warning("Invalid JSON payload: %s", e)
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event")
    if not event:
        return {"ok": True, "msg": "No event object"}

    event_type = event.get("type")
    app_user_id = event.get("app_user_id")
    product_id = event.get("product_id")
    if not app_user_id or not product_id:
        return {"ok": True, "msg": "Missing app_user_id or product_id"}

    db = request.app.state.db
    event_key = _event_key(event)
    log.info("RevenueCat webhook: %s user=%s product=%s event=%s",
             event_type, app_user_id, product_id, event_key)

    # RevenueCat delivers at-least-once and retries anything that isn't a 2xx,
    # so claim the event before granting anything. The unique index is the real
    # guard — it also rejects a redelivery racing the original — while this read
    # short-circuits the ordinary sequential retry.
    prior = await db.revenuecat_events.find_one({"event_id": event_key}, {"_id": 0, "fulfilled": 1})
    if prior is None:
        try:
            await db.revenuecat_events.insert_one({
                "event_id": event_key,
                "type": event_type,
                "app_user_id": app_user_id,
                "product_id": product_id,
                "payload": payload,
                "received_at": now_utc(),
                "fulfilled": False,
            })
        except DuplicateKeyError:
            prior = await db.revenuecat_events.find_one(
                {"event_id": event_key}, {"_id": 0, "fulfilled": 1})

    if prior is not None:
        if prior.get("fulfilled"):
            log.info("Duplicate RevenueCat event %s — already fulfilled", event_key)
            return {"ok": True, "duplicate": True}
        # Claimed earlier but never completed, so a previous attempt died
        # partway. Retrying is the lesser risk against dropping the purchase.
        log.warning("Retrying unfulfilled RevenueCat event %s", event_key)

    if event_type not in FULFILLABLE_EVENTS:
        await _mark_fulfilled(db, event_key)
        return {"ok": True, "msg": "Ignored event type"}

    user = await db.users.find_one({"user_id": app_user_id}, {"_id": 0, "user_id": 1})
    if not user:
        # Answering 2xx here would retire the event permanently and lose a paid
        # purchase. Fail instead, so RevenueCat retries while the cause clears.
        log.error("RevenueCat purchase for unknown user %s (product %s, event %s)",
                  app_user_id, product_id, event_key)
        raise HTTPException(status_code=503, detail="Unknown user; retry later")

    update_doc, reason = compute_grant(product_id, event)
    if update_doc is None:
        log.error("Not credited: product_id=%r (base %r) user=%s event=%s reason=%s",
                  product_id, base_product_id(product_id), app_user_id, event_key, reason)
        await _mark_unfulfilled(db, event_key, reason)
        return {"ok": True, "fulfilled": False, "reason": reason}

    await db.users.update_one({"user_id": app_user_id}, update_doc)
    log.info("Credited user %s: %s", app_user_id, update_doc)
    await _mark_fulfilled(db, event_key)
    return {"ok": True, "fulfilled": True}


# ── Restore ──────────────────────────────────────────────────────────────────
#
# The webhook is push-only. If a delivery is lost, rejected, or mapped to
# nothing, the purchase never reaches the account and nothing retries. Restore
# is the pull side, letting the app reconcile on demand — and it is also what
# both stores require of any app selling a subscription, so a buyer switching
# devices can get their entitlement back.
#
# Two paths, and the difference between them is the whole reason consumables
# are handled the way they are:
#
#   Live lookup (REVENUECAT_API_KEY set) reads the subscriber's current state
#   from RevenueCat. That state is a *purchase history*, so it must grant
#   **subscriptions only** — re-granting a consumable from history would hand
#   out balance on every tap of the restore button.
#
#   Replay (no key, or as a supplement) re-runs this server's own stored
#   deliveries that were never fulfilled. Those are gated by the `fulfilled`
#   flag, so each one grants at most once — which makes it safe for consumables
#   too, and it is the only path that can recover a credit pack whose webhook
#   never arrived.
#
# Neither path ever shortens an entitlement. `$max` on the expiry means a
# restore can only ever move the date later, so restoring while a longer pass
# is active cannot cost the user the time they already bought.

REVENUECAT_API_KEY = os.environ.get("REVENUECAT_API_KEY", "")
REVENUECAT_API_BASE = "https://api.revenuecat.com/v1"


def parse_rc_datetime(value: Optional[str]) -> Optional[datetime]:
    """RevenueCat timestamps look like `2026-09-20T04:55:33Z`."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        log.warning("Unparseable RevenueCat timestamp %r", value)
        return None


async def _fetch_subscriber(user_id: str) -> Optional[Dict[str, Any]]:
    """The subscriber RevenueCat holds under this app_user_id.

    Looked up by the caller's own id, taken from their session — the request
    body carries no identifier, so nobody can restore onto someone else's
    account.
    """
    if not REVENUECAT_API_KEY:
        return None
    url = f"{REVENUECAT_API_BASE}/subscribers/{quote(user_id, safe='')}"
    headers = {"Authorization": f"Bearer {REVENUECAT_API_KEY}"}
    async with httpx.AsyncClient(timeout=15.0) as hc:
        r = await hc.get(url, headers=headers)
    if r.status_code == 404:
        return None  # never purchased anything; not an error
    if r.status_code != 200:
        log.error("RevenueCat subscriber lookup failed: %s %s", r.status_code, r.text[:300])
        raise HTTPException(status_code=502, detail="Couldn't reach the store. Try again shortly.")
    return r.json().get("subscriber") or {}


async def restore_subscriptions(db, user_id: str, fetch_subscriber=None) -> Dict[str, Any]:
    """Reconcile `user_id`'s entitlements against the store and stored deliveries.

    `fetch_subscriber` is injectable so the behaviour can be tested without a
    network stub.
    """
    fetch = fetch_subscriber or _fetch_subscriber
    restored: List[str] = []

    # ── Live subscriptions ────────────────────────────────────────────────
    subscriber = await fetch(user_id)
    if subscriber:
        for product_id, sub in (subscriber.get("subscriptions") or {}).items():
            field = SUBSCRIPTION_GRANTS.get(base_product_id(product_id))
            if not field:
                continue
            expires = parse_rc_datetime(sub.get("expires_date"))
            if not expires:
                continue
            # $max never moves an expiry backwards, so a restore run against a
            # lapsed subscription cannot cut short a longer pass bought since.
            await db.users.update_one({"user_id": user_id}, {"$max": {field: expires}})
            restored.append(product_id)
            log.info("Restored %s for %s until %s", product_id, user_id, expires.isoformat())

    # ── Deliveries this server recorded but never credited ────────────────
    replayed: List[str] = []
    cursor = db.revenuecat_events.find(
        {"app_user_id": user_id, "fulfilled": False}, {"_id": 0}
    )
    async for event_doc in cursor:
        event = (event_doc.get("payload") or {}).get("event") or {}
        product_id = event_doc.get("product_id") or event.get("product_id") or ""
        if event_doc.get("type") not in FULFILLABLE_EVENTS:
            continue
        update_doc, reason = compute_grant(product_id, event)
        if update_doc is None:
            log.info("Replay skipped %s for %s: %s", product_id, user_id, reason)
            continue
        await db.users.update_one({"user_id": user_id}, update_doc)
        await _mark_fulfilled(db, event_doc["event_id"])
        replayed.append(product_id)
        log.info("Replayed %s for %s", product_id, user_id)

    return {
        "ok": True,
        "restored": restored,
        "replayed": replayed,
        # Tells the client whether an empty result means "nothing to restore" or
        # "we couldn't actually check" — a real distinction to a buyer staring
        # at a balance that hasn't moved.
        "checked_store": subscriber is not None,
    }
