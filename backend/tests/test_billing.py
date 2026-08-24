"""Credit ledger.

The rules under test are the ones that cost real money when they are wrong:
free credits are spent before paid ones, a failed call is refunded from
whichever balance paid for it, and an exhausted account gets a 402 carrying the
numbers a paywall needs to render.
"""
import pytest
from datetime import timedelta

from fastapi import HTTPException

import billing


@pytest.mark.asyncio
async def test_new_user_has_the_free_allowance(db, user):
    ent = await billing.get_entitlement(db, user)
    assert ent["free_credits_remaining"] == billing.FREE_CREDITS
    assert ent["paid_credits"] == 0
    assert ent["total_available"] == billing.FREE_CREDITS
    assert ent["is_unlimited"] is False


@pytest.mark.asyncio
async def test_unknown_user_is_quoted_the_free_allowance(db):
    """A user who has never been written to Mongo still sees the free tier.

    The client asks for entitlements before the first call, and a zero here
    would show a paywall to someone who has not spent anything.
    """
    ent = await billing.get_entitlement(db, "user_who_does_not_exist")
    assert ent["total_available"] == billing.FREE_CREDITS


@pytest.mark.asyncio
async def test_free_credits_are_spent_before_paid_ones(db, user):
    db.users.docs[0]["paid_credits"] = 10

    for _ in range(billing.FREE_CREDITS):
        await billing.consume_credits(db, user, "debug_session")

    ent = await billing.get_entitlement(db, user)
    assert ent["free_credits_remaining"] == 0
    assert ent["paid_credits"] == 10, "a purchased balance was spent while free credits remained"

    spent = await billing.consume_credits(db, user, "debug_session")
    assert spent == {"free_consumed": 0, "paid_consumed": 1,
                     "total_consumed": 1, "unlimited": False}


@pytest.mark.asyncio
async def test_exhausted_account_raises_402_with_paywall_numbers(db, user):
    for _ in range(billing.FREE_CREDITS):
        await billing.consume_credits(db, user, "circuit_generation")

    with pytest.raises(HTTPException) as exc:
        await billing.consume_credits(db, user, "circuit_generation")

    assert exc.value.status_code == 402
    assert exc.value.detail["code"] == "insufficient_credits"
    assert exc.value.detail["available"] == 0
    assert exc.value.detail["needed"] == billing.CREDIT_COST["circuit_generation"]


@pytest.mark.asyncio
async def test_refund_returns_the_credit_to_the_balance_it_came_from(db, user):
    """Scribe's refund only decrements the free counter.

    Applied to a charge that came out of a purchased balance, that hands the
    user back a free credit they had already used and quietly keeps the paid
    one. Here the refund reverses what was actually taken.
    """
    db.users.docs[0]["free_credits_used"] = billing.FREE_CREDITS
    db.users.docs[0]["paid_credits"] = 3

    spent = await billing.consume_credits(db, user, "debug_session")
    assert spent["paid_consumed"] == 1

    await billing.refund_credits(db, user, spent)

    ent = await billing.get_entitlement(db, user)
    assert ent["paid_credits"] == 3
    assert ent["free_credits_remaining"] == 0


@pytest.mark.asyncio
async def test_unlimited_pass_bypasses_deduction(db, user):
    db.users.docs[0]["trace_unlimited_until"] = billing.now_utc() + timedelta(days=30)

    ent = await billing.get_entitlement(db, user)
    assert ent["is_unlimited"] is True
    assert ent["is_trace_unlimited"] is True

    for _ in range(20):
        spent = await billing.consume_credits(db, user, "debug_session")
        assert spent["unlimited"] is True

    assert (await billing.get_entitlement(db, user))["free_credits_remaining"] == billing.FREE_CREDITS


@pytest.mark.asyncio
async def test_expired_pass_does_not_grant_unlimited(db, user):
    db.users.docs[0]["trace_unlimited_until"] = billing.now_utc() - timedelta(minutes=1)
    ent = await billing.get_entitlement(db, user)
    assert ent["is_unlimited"] is False


@pytest.mark.asyncio
async def test_unlimited_until_reports_whichever_pass_runs_longer(db, user):
    """Subscribing must never shorten access already paid for."""
    later = billing.now_utc() + timedelta(days=60)
    db.users.docs[0]["credits_unlimited_until"] = later
    db.users.docs[0]["trace_unlimited_until"] = billing.now_utc() + timedelta(days=7)

    ent = await billing.get_entitlement(db, user)
    assert ent["unlimited_until"] == later.isoformat()


@pytest.mark.asyncio
async def test_refund_is_a_no_op_for_an_unlimited_user(db, user):
    db.users.docs[0]["trace_unlimited_until"] = billing.now_utc() + timedelta(days=30)
    spent = await billing.consume_credits(db, user, "debug_session")
    await billing.refund_credits(db, user, spent)
    assert (await billing.get_entitlement(db, user))["free_credits_remaining"] == billing.FREE_CREDITS
