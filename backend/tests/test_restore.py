"""Restore purchases.

Restore is the recovery path for money that already moved, so its failure modes
are the expensive kind: shortening an entitlement someone paid for, granting one
twice, or granting one onto the wrong account. Each has a test here.
"""
from datetime import datetime, timedelta, timezone

import pytest

import revenuecat_webhook as rc


def now():
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    """RevenueCat's wire format: `2026-09-20T04:55:33Z`."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def subscriber_with(product_id: str, expires: datetime):
    async def fetch(_user_id):
        return {"subscriptions": {product_id: {"expires_date": iso(expires)}}}

    return fetch


async def no_subscriber(_user_id):
    """What RevenueCat returns for someone who has never bought anything."""
    return None


@pytest.mark.asyncio
async def test_restores_an_active_subscription(db, user):
    expires = now() + timedelta(days=30)
    result = await rc.restore_subscriptions(
        db, user, fetch_subscriber=subscriber_with("trace_unlimited_monthly", expires)
    )

    assert result["restored"] == ["trace_unlimited_monthly"]
    assert result["checked_store"] is True
    stored = db.users.docs[0]["trace_unlimited_until"]
    assert abs((stored - expires).total_seconds()) < 1


@pytest.mark.asyncio
async def test_play_base_plan_suffix_still_matches(db, user):
    """Play reports a subscription as `productId:basePlanId`.

    Passed through unnormalised it matches no grant table, and the buyer's
    restore silently does nothing.
    """
    expires = now() + timedelta(days=30)
    result = await rc.restore_subscriptions(
        db, user, fetch_subscriber=subscriber_with("trace_unlimited_monthly:monthly", expires)
    )

    assert result["restored"] == ["trace_unlimited_monthly:monthly"]
    assert db.users.docs[0]["trace_unlimited_until"] is not None


@pytest.mark.asyncio
async def test_restore_never_shortens_an_entitlement(db, user):
    """A lapsed subscription must not claw back a longer pass bought since.

    `$max` is the mechanism; this is the test that would catch it becoming
    `$set`.
    """
    longer = now() + timedelta(days=90)
    db.users.docs[0]["trace_unlimited_until"] = longer

    await rc.restore_subscriptions(
        db, user,
        fetch_subscriber=subscriber_with("trace_unlimited_monthly", now() + timedelta(days=3)),
    )

    assert db.users.docs[0]["trace_unlimited_until"] == longer


@pytest.mark.asyncio
async def test_unknown_product_is_ignored(db, user):
    await rc.restore_subscriptions(
        db, user,
        fetch_subscriber=subscriber_with("some_other_app_product", now() + timedelta(days=30)),
    )
    assert "trace_unlimited_until" not in db.users.docs[0]


@pytest.mark.asyncio
async def test_a_subscription_with_no_expiry_grants_nothing(db, user):
    """Granting without an expiry would mean inventing one."""

    async def fetch(_user_id):
        return {"subscriptions": {"trace_unlimited_monthly": {"expires_date": None}}}

    result = await rc.restore_subscriptions(db, user, fetch_subscriber=fetch)
    assert result["restored"] == []
    assert "trace_unlimited_until" not in db.users.docs[0]


@pytest.mark.asyncio
async def test_no_store_lookup_is_reported_as_such(db, user):
    """Empty and unchecked are different answers to "where are my credits?"."""
    result = await rc.restore_subscriptions(db, user, fetch_subscriber=no_subscriber)
    assert result["checked_store"] is False
    assert result["restored"] == []


@pytest.mark.asyncio
async def test_replay_credits_a_delivery_that_never_fulfilled(db, user):
    """A consumable whose webhook arrived but credited nothing.

    The live-lookup path cannot recover this — RevenueCat's purchase history
    would re-grant it on every restore — so it comes from the stored delivery,
    which the `fulfilled` flag lets run exactly once.
    """
    db.revenuecat_events.docs.append({
        "event_id": "evt_1",
        "type": "NON_RENEWING_PURCHASE",
        "app_user_id": user,
        "product_id": "credits_25",
        "payload": {"event": {"id": "evt_1", "type": "NON_RENEWING_PURCHASE",
                              "product_id": "credits_25", "app_user_id": user}},
        "fulfilled": False,
    })

    result = await rc.restore_subscriptions(db, user, fetch_subscriber=no_subscriber)

    assert result["replayed"] == ["credits_25"]
    assert db.users.docs[0]["paid_credits"] == 25
    assert db.revenuecat_events.docs[0]["fulfilled"] is True


@pytest.mark.asyncio
async def test_replay_is_idempotent(db, user):
    """The second restore must not hand out the pack again."""
    db.revenuecat_events.docs.append({
        "event_id": "evt_1",
        "type": "NON_RENEWING_PURCHASE",
        "app_user_id": user,
        "product_id": "credits_10",
        "payload": {"event": {"id": "evt_1", "type": "NON_RENEWING_PURCHASE",
                              "product_id": "credits_10", "app_user_id": user}},
        "fulfilled": False,
    })

    await rc.restore_subscriptions(db, user, fetch_subscriber=no_subscriber)
    await rc.restore_subscriptions(db, user, fetch_subscriber=no_subscriber)

    assert db.users.docs[0]["paid_credits"] == 10


@pytest.mark.asyncio
async def test_replay_skips_another_users_delivery(db, user):
    """The query is keyed on app_user_id; this is the test that keeps it that way."""
    db.revenuecat_events.docs.append({
        "event_id": "evt_other",
        "type": "NON_RENEWING_PURCHASE",
        "app_user_id": "user_somebody_else",
        "product_id": "credits_60",
        "payload": {"event": {"id": "evt_other", "type": "NON_RENEWING_PURCHASE",
                              "product_id": "credits_60"}},
        "fulfilled": False,
    })

    result = await rc.restore_subscriptions(db, user, fetch_subscriber=no_subscriber)

    assert result["replayed"] == []
    assert "paid_credits" not in db.users.docs[0]


@pytest.mark.asyncio
async def test_replay_ignores_non_purchase_events(db, user):
    """A cancellation is not a purchase and must credit nothing."""
    db.revenuecat_events.docs.append({
        "event_id": "evt_cancel",
        "type": "CANCELLATION",
        "app_user_id": user,
        "product_id": "credits_10",
        "payload": {"event": {"id": "evt_cancel", "type": "CANCELLATION",
                              "product_id": "credits_10"}},
        "fulfilled": False,
    })

    result = await rc.restore_subscriptions(db, user, fetch_subscriber=no_subscriber)
    assert result["replayed"] == []


def test_timestamp_parsing():
    assert rc.parse_rc_datetime("2026-09-20T04:55:33Z") == datetime(
        2026, 9, 20, 4, 55, 33, tzinfo=timezone.utc
    )
    assert rc.parse_rc_datetime(None) is None
    assert rc.parse_rc_datetime("not a date") is None
