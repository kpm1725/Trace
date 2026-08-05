"""Tests for the credit ledger and the RevenueCat webhook handler.

Webhook payloads here follow RevenueCat's documented event schema (id, type,
app_user_id, product_id, expiration_at_ms). If RevenueCat changes that shape,
these fixtures — and billing.py's field access — need updating together;
confirm against a real sample event from the dashboard.
"""
from datetime import datetime, timezone, timedelta

import pytest
from fastapi import HTTPException

from billing import (
    handle_revenuecat_event, reconcile_pending_events,
    get_entitlement, consume_credit,
    FREE_CREDITS, CREDIT_PRODUCTS, UNLIMITED_PRODUCT_ID,
)

pytestmark = pytest.mark.asyncio


def event(event_id="evt_1", type="INITIAL_PURCHASE", app_user_id="user_abc123",
          product_id="trace_credits_10", expiration_at_ms=None):
    e = {"id": event_id, "type": type, "app_user_id": app_user_id, "product_id": product_id}
    if expiration_at_ms is not None:
        e["expiration_at_ms"] = expiration_at_ms
    return e


def in_days(n):
    return int((datetime.now(timezone.utc) + timedelta(days=n)).timestamp() * 1000)


# ─── Credit ledger ───────────────────────────────────────────────────────────

async def test_new_user_starts_with_free_credits(db, user):
    ent = await get_entitlement(db, user)
    assert ent["total_available"] == FREE_CREDITS
    assert ent["is_unlimited"] is False


async def test_free_credits_consumed_before_paid(db, user):
    await handle_revenuecat_event(db, event(product_id="trace_credits_10"))
    for _ in range(FREE_CREDITS):
        await consume_credit(db, user)
    ent = await get_entitlement(db, user)
    assert ent["free_credits_remaining"] == 0
    assert ent["paid_credits"] == 10, "paid credits must not be touched while free remain"


async def test_consume_past_free_tier_draws_from_paid(db, user):
    await handle_revenuecat_event(db, event(product_id="trace_credits_10"))
    for _ in range(FREE_CREDITS + 3):
        await consume_credit(db, user)
    ent = await get_entitlement(db, user)
    assert ent["paid_credits"] == 7
    assert ent["total_available"] == 7


async def test_out_of_credits_raises_402(db, user):
    for _ in range(FREE_CREDITS):
        await consume_credit(db, user)
    with pytest.raises(HTTPException) as exc:
        await consume_credit(db, user)
    assert exc.value.status_code == 402
    assert exc.value.detail["code"] == "insufficient_credits"


async def test_unlimited_pass_does_not_consume_credits(db, user):
    await handle_revenuecat_event(db, event(
        product_id=UNLIMITED_PRODUCT_ID, expiration_at_ms=in_days(30)))
    for _ in range(50):
        await consume_credit(db, user)
    ent = await get_entitlement(db, user)
    assert ent["is_unlimited"] is True
    assert ent["free_credits_remaining"] == FREE_CREDITS, "unlimited must not burn free credits"


async def test_expired_unlimited_pass_is_not_active(db, user):
    await handle_revenuecat_event(db, event(
        product_id=UNLIMITED_PRODUCT_ID, expiration_at_ms=in_days(-1)))
    ent = await get_entitlement(db, user)
    assert ent["is_unlimited"] is False


# ─── Webhook handling ────────────────────────────────────────────────────────

@pytest.mark.parametrize("product_id,expected", list(CREDIT_PRODUCTS.items()))
async def test_each_credit_pack_grants_its_credits(db, user, product_id, expected):
    status = await handle_revenuecat_event(db, event(product_id=product_id))
    assert status == "credits_granted"
    ent = await get_entitlement(db, user)
    assert ent["paid_credits"] == expected


async def test_duplicate_event_is_ignored(db, user):
    await handle_revenuecat_event(db, event(event_id="evt_dup"))
    status = await handle_revenuecat_event(db, event(event_id="evt_dup"))
    assert status == "duplicate"
    ent = await get_entitlement(db, user)
    assert ent["paid_credits"] == 10, "replayed event must not credit twice"


async def test_renewal_extends_unlimited(db, user):
    await handle_revenuecat_event(db, event(
        event_id="e1", product_id=UNLIMITED_PRODUCT_ID, expiration_at_ms=in_days(30)))
    await handle_revenuecat_event(db, event(
        event_id="e2", type="RENEWAL", product_id=UNLIMITED_PRODUCT_ID,
        expiration_at_ms=in_days(60)))
    ent = await get_entitlement(db, user)
    assert ent["is_unlimited"] is True
    assert "unlimited_until" in ent and ent["unlimited_until"] is not None


async def test_cancellation_keeps_access_until_expiry(db, user):
    """Cancelling only stops renewal — paid-for time must not be revoked."""
    await handle_revenuecat_event(db, event(
        event_id="e1", product_id=UNLIMITED_PRODUCT_ID, expiration_at_ms=in_days(30)))
    status = await handle_revenuecat_event(db, event(
        event_id="e2", type="CANCELLATION", product_id=UNLIMITED_PRODUCT_ID))
    assert status == "noted"
    ent = await get_entitlement(db, user)
    assert ent["is_unlimited"] is True, "user paid through the period; access must remain"


async def test_malformed_event_is_rejected_not_crashed(db):
    assert await handle_revenuecat_event(db, {}) == "malformed"
    assert await handle_revenuecat_event(db, {"id": "x"}) == "malformed"


async def test_unmapped_product_does_not_grant_anything(db, user):
    status = await handle_revenuecat_event(db, event(product_id="some_other_sku"))
    assert status == "unmapped_product"
    ent = await get_entitlement(db, user)
    assert ent["paid_credits"] == 0


async def test_unlimited_purchase_without_expiry_is_flagged(db, user):
    status = await handle_revenuecat_event(db, event(product_id=UNLIMITED_PRODUCT_ID))
    assert status == "missing_expiry"


# ─── The bug that lost money: unknown user ───────────────────────────────────

async def test_purchase_for_unknown_user_is_parked_not_dropped(db):
    status = await handle_revenuecat_event(db, event(app_user_id="$RCAnonymousID:deadbeef"))
    assert status == "unknown_user"
    parked = await db.pending_billing_events.find_one({"app_user_id": "$RCAnonymousID:deadbeef"})
    assert parked is not None, "a real purchase must never be silently discarded"


async def test_parked_purchase_is_applied_once_user_exists(db):
    await handle_revenuecat_event(db, event(app_user_id="user_late"))
    # User signs in / account is created after the webhook already landed.
    await db.users.insert_one({
        "user_id": "user_late", "email": "l@b.c", "free_credits_used": 0, "paid_credits": 0})

    applied = await reconcile_pending_events(db, "user_late")
    assert applied == 1
    ent = await get_entitlement(db, "user_late")
    assert ent["paid_credits"] == 10


async def test_reconcile_is_idempotent(db):
    await handle_revenuecat_event(db, event(app_user_id="user_late"))
    await db.users.insert_one({
        "user_id": "user_late", "email": "l@b.c", "free_credits_used": 0, "paid_credits": 0})

    await reconcile_pending_events(db, "user_late")
    again = await reconcile_pending_events(db, "user_late")
    assert again == 0, "second reconcile must not re-grant"
    ent = await get_entitlement(db, "user_late")
    assert ent["paid_credits"] == 10


async def test_reconcile_leaves_event_parked_if_user_still_missing(db):
    await handle_revenuecat_event(db, event(app_user_id="user_ghost"))
    applied = await reconcile_pending_events(db, "user_ghost")
    assert applied == 0
    assert await db.pending_billing_events.count_documents({}) == 1


async def test_failed_apply_releases_claim_for_retry(db, user, monkeypatch):
    """If applying an event blows up, the idempotency marker must not survive —
    otherwise RevenueCat's retry is swallowed as a duplicate and money is lost."""
    import billing

    async def boom(*a, **k):
        raise RuntimeError("mongo down")

    monkeypatch.setattr(billing, "grant_credits", boom)
    with pytest.raises(RuntimeError):
        await handle_revenuecat_event(db, event(event_id="evt_boom"))

    assert await db.billing_events.find_one({"event_id": "evt_boom"}) is None

    # Retry after recovery succeeds and credits exactly once.
    monkeypatch.undo()
    status = await handle_revenuecat_event(db, event(event_id="evt_boom"))
    assert status == "credits_granted"
    ent = await get_entitlement(db, user)
    assert ent["paid_credits"] == 10
