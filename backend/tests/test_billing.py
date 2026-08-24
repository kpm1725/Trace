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
        await billing.consume_credits(db, user, "debug_session")

    with pytest.raises(HTTPException) as exc:
        await billing.consume_credits(db, user, "debug_session")

    assert exc.value.status_code == 402
    assert exc.value.detail["code"] == "insufficient_credits"
    assert exc.value.detail["available"] == 0
    assert exc.value.detail["needed"] == billing.CREDIT_COST["debug_session"]


@pytest.mark.asyncio
async def test_a_generation_costs_more_than_a_diagnosis(db, user):
    """The weighting is the pricing model, so it is worth pinning."""
    assert billing.CREDIT_COST["circuit_generation"] > billing.CREDIT_COST["debug_session"]

    spent = await billing.consume_credits(db, user, "circuit_generation")
    assert spent["total_consumed"] == billing.CREDIT_COST["circuit_generation"]

    ent = await billing.get_entitlement(db, user)
    assert ent["total_available"] == billing.FREE_CREDITS - spent["total_consumed"]


@pytest.mark.asyncio
async def test_a_partial_balance_is_refused_rather_than_part_spent(db, user):
    """A user with 1 credit cannot start a 2-credit generation.

    The failure mode this rules out is charging the 1 credit, failing the call
    for want of the second, and leaving the user poorer with nothing to show.
    """
    db.users.docs[0]["free_credits_used"] = billing.FREE_CREDITS - 1

    with pytest.raises(HTTPException) as exc:
        await billing.consume_credits(db, user, "circuit_generation")

    assert exc.value.detail["available"] == 1
    assert exc.value.detail["needed"] == 2
    # Nothing was taken on the way out.
    assert (await billing.get_entitlement(db, user))["total_available"] == 1


@pytest.mark.asyncio
async def test_a_charge_can_straddle_the_free_and_paid_balances(db, user):
    """One free credit left and a 2-credit call: one from each.

    Splitting like this is what keeps the free allowance from being stranded —
    the alternative, refusing to mix, leaves a credit nobody can ever spend.
    """
    db.users.docs[0]["free_credits_used"] = billing.FREE_CREDITS - 1
    db.users.docs[0]["paid_credits"] = 4

    spent = await billing.consume_credits(db, user, "circuit_generation")
    assert spent == {"free_consumed": 1, "paid_consumed": 1,
                     "total_consumed": 2, "unlimited": False}

    ent = await billing.get_entitlement(db, user)
    assert ent["free_credits_remaining"] == 0
    assert ent["paid_credits"] == 3

    # And the refund puts both halves back where they came from.
    await billing.refund_credits(db, user, spent)
    ent = await billing.get_entitlement(db, user)
    assert ent["free_credits_remaining"] == 1
    assert ent["paid_credits"] == 4


@pytest.mark.asyncio
async def test_refund_returns_the_credit_to_the_balance_it_came_from(db, user):
    """A refund that only decremented the free counter would be wrong here.

    Applied to a charge that came out of a purchased balance, it hands the user
    back a free credit they had already used and quietly keeps the paid one.
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
