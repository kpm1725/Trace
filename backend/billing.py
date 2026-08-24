"""Credit ledger and entitlement gates.

Modelled directly on Scribe's chunk billing (`get_conversion_entitlement` /
`consume_chunks` in its `server.py`): a lifetime free allowance, a prepaid
balance bought as consumables, and a time-boxed unlimited pass that bypasses
deduction entirely. Same three fields, same priority order, same 402 shape — a
client written against one reads the other.

    unlimited pass  ->  free allowance  ->  prepaid balance  ->  402

>>> THE BILLING UNIT IS NOT SETTLED. <<<
`CREDIT_COST` below is the whole decision, and it is a placeholder pending
confirmation. It currently charges 1 credit per AI call, which makes a photo
diagnosis and a circuit generation cost the same. That is the simplest thing
that could work and it is not obviously right — a diagnosis is one vision call
on one image, a generation is a longer completion, and their token costs differ
by roughly 2-3x in practice. The alternatives are separate balances per feature
(Scribe's shape: coverage credits and chunk credits never mix) or a weighted
single balance (a generation costs 2). Nothing else in this module changes
whichever way that goes — only this table and the product grants below.
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

log = logging.getLogger("trace")

# Lifetime free credits per account, shared across every feature. Scribe grants
# 5 conversion chunks on the same terms.
FREE_CREDITS = 5

# PLACEHOLDER — see the module docstring. One credit per AI call.
CREDIT_COST = {
    "debug_session": 1,
    "circuit_generation": 1,
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if not dt:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _later(a: Optional[datetime], b: Optional[datetime]) -> Optional[datetime]:
    return max([d for d in (a, b) if d], default=None)


def trace_unlimited_until(u: dict) -> Optional[datetime]:
    """Expiry of an active Trace Unlimited subscription, else None.

    Every gate asks this rather than re-deriving the check. Scribe learned that
    one the hard way: a gate that re-implements the comparison is a gate that
    misses the next entitlement added beside it.
    """
    until = _aware(u.get("trace_unlimited_until"))
    return until if until and until > now_utc() else None


async def get_entitlement(db, user_id: str) -> dict:
    """The caller's credit position, in the shape the client's paywall reads."""
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        return {
            "free_credits_used": 0, "free_credits_remaining": FREE_CREDITS,
            "paid_credits": 0, "total_available": FREE_CREDITS,
            "is_unlimited": False, "unlimited_until": None, "is_trace_unlimited": False,
        }

    free_used = int(u.get("free_credits_used", 0))
    free_remaining = max(0, FREE_CREDITS - free_used)
    paid_credits = int(u.get("paid_credits", 0))

    until = _aware(u.get("credits_unlimited_until"))
    if until and until <= now_utc():
        until = None

    # Either the credit pass or Trace Unlimited lifts the limit; report
    # whichever runs longer, since the field answers "when does unlimited access
    # end" regardless of which product granted it.
    unlimited = trace_unlimited_until(u)
    until = _later(until, unlimited)

    return {
        "free_credits_used": free_used,
        "free_credits_remaining": free_remaining,
        "paid_credits": paid_credits,
        "total_available": free_remaining + paid_credits,
        "is_unlimited": until is not None,
        "unlimited_until": until.isoformat() if until else None,
        "is_trace_unlimited": unlimited is not None,
    }


async def consume_credits(db, user_id: str, action: str) -> dict:
    """Charge for `action`, or raise 402 with what the paywall needs to render.

    Free credits are spent before paid ones, so a user who buys a pack never
    loses the free allowance they had not reached yet.
    """
    count = CREDIT_COST[action]
    ent = await get_entitlement(db, user_id)

    if ent["is_unlimited"]:
        return {"free_consumed": 0, "paid_consumed": 0, "total_consumed": count, "unlimited": True}

    if ent["total_available"] < count:
        raise HTTPException(status_code=402, detail={
            "code": "insufficient_credits",
            "message": f"Not enough credits. Need {count}, have {ent['total_available']}.",
            "available": ent["total_available"],
            "needed": count,
        })

    free_to_consume = min(count, ent["free_credits_remaining"])
    paid_to_consume = count - free_to_consume

    inc = {}
    if free_to_consume:
        inc["free_credits_used"] = free_to_consume
    if paid_to_consume:
        inc["paid_credits"] = -paid_to_consume
    if inc:
        await db.users.update_one({"user_id": user_id}, {"$inc": inc})

    return {
        "free_consumed": free_to_consume,
        "paid_consumed": paid_to_consume,
        "total_consumed": count,
        "unlimited": False,
    }


async def refund_credits(db, user_id: str, spent: dict) -> None:
    """Give back credits charged for a call that then failed upstream.

    Scribe's equivalent refunds only the free counter, which silently keeps the
    money when the charge came out of a paid balance. This reverses whatever was
    actually taken.
    """
    if spent.get("unlimited"):
        return
    inc = {}
    if spent.get("free_consumed"):
        inc["free_credits_used"] = -spent["free_consumed"]
    if spent.get("paid_consumed"):
        inc["paid_credits"] = spent["paid_consumed"]
    if inc:
        await db.users.update_one({"user_id": user_id}, {"$inc": inc})
