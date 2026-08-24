"""RevenueCat webhook — server-side fulfilment of native in-app purchases.

Purchases happen natively on the device through RevenueCat, which wraps Apple
IAP and Google Play Billing. The app never tells this server what was bought;
RevenueCat does, by POSTing here. That is the whole reason fulfilment is
server-side: a client that could assert its own entitlements is a client that
can grant itself unlimited credits.

Structure mirrors Scribe's `backend/revenuecat_webhook.py`, including the parts
that exist because of specific incidents there:

  - `base_product_id` strips Google Play's `:basePlanId` suffix. Play identifies
    a subscription as `productId:basePlanId` and RevenueCat passes that through,
    so `trace_unlimited_monthly` arrives as `trace_unlimited_monthly:monthly`
    and matches no grant table keyed on the bare id. The client normalises
    identically in `frontend/src/billing/products.ts`.

  - A delivery that credits nothing is kept `fulfilled: False` with a reason
    rather than being retired. Marking it fulfilled would permanently and
    silently discard a purchase the user paid for.

  - An unknown user gets a 503, not a 2xx. A 2xx retires the event; RevenueCat
    would never retry, and the buyer would be charged and never credited.

NOTE: the product ids below follow from the billing unit, which is not settled
(see billing.py). If usage ends up metered separately per feature rather than
from one shared balance, these tables and `frontend/src/billing/products.ts`
change together — a product missing from either side can never be bought or
never be credited.
"""
import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

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
