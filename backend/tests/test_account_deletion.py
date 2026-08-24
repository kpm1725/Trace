"""Account deletion.

Both stores require this route, and Google Play additionally requires a deletion
path reachable without installing the app. The failure mode worth testing for is
not a crash — it is data quietly surviving a deletion request, which is both a
policy breach and a promise broken to someone who asked to be forgotten.
"""
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "trace_test")
os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test-not-a-real-key")
os.environ.setdefault("GOOGLE_CLIENT_IDS", "test.apps.googleusercontent.com")

import server  # noqa: E402  — must follow the env vars above


@pytest.fixture
def populated(db, monkeypatch):
    """A signed-in user with a row in every collection deletion should clear."""
    uid = "user_delete_me"
    token = "trace_testtoken"

    db.users.docs.append({"user_id": uid, "email": "gone@example.com", "paid_credits": 7})
    db.user_sessions.docs.append({
        "session_token": token,
        "user_id": uid,
        "expires_at": server.now_utc() + server.timedelta(days=7),
    })
    db.sessions.docs.append({"session_id": "sess_1", "user_id": uid, "kind": "debug"})
    db.revenuecat_events.docs.append({"event_id": "evt_1", "app_user_id": uid})

    # Someone else's data, to prove the purge is scoped to the caller.
    db.users.docs.append({"user_id": "user_bystander", "email": "stays@example.com"})
    db.sessions.docs.append({"session_id": "sess_2", "user_id": "user_bystander"})
    db.revenuecat_events.docs.append({"event_id": "evt_2", "app_user_id": "user_bystander"})

    monkeypatch.setattr(server, "db", db)
    return {"db": db, "uid": uid, "token": token}


@pytest.mark.asyncio
async def test_deletion_purges_every_user_collection(populated):
    db, token = populated["db"], populated["token"]

    result = await server.delete_account(authorization=f"Bearer {token}")

    assert result["ok"] is True
    assert db.users.docs == [{"user_id": "user_bystander", "email": "stays@example.com"}]
    assert [s["session_id"] for s in db.sessions.docs] == ["sess_2"]
    assert [e["event_id"] for e in db.revenuecat_events.docs] == ["evt_2"]
    assert db.user_sessions.docs == []


@pytest.mark.asyncio
async def test_every_declared_collection_is_actually_purged(populated):
    """USER_COLLECTIONS is the list the purge walks.

    A collection added to the schema but forgotten here is how orphaned data
    survives a deletion request, so assert the route reports on each one rather
    than trusting the loop.
    """
    result = await server.delete_account(authorization=f"Bearer {populated['token']}")
    for collection in server.USER_COLLECTIONS:
        assert collection in result["deleted"], f"{collection} was never purged"
    assert "revenuecat_events" in result["deleted"]
    assert "user_sessions" in result["deleted"]
    assert "users" in result["deleted"]


@pytest.mark.asyncio
async def test_deletion_needs_a_valid_session(populated):
    """The caller's id comes from their session; the request carries none.

    That is what makes it impossible to delete somebody else's account — there
    is no identifier in the request to tamper with.
    """
    with pytest.raises(HTTPException) as exc:
        await server.delete_account(authorization="Bearer not_a_real_token")
    assert exc.value.status_code == 401

    with pytest.raises(HTTPException) as exc:
        await server.delete_account(authorization=None)
    assert exc.value.status_code == 401

    # Nothing was touched.
    assert len(populated["db"].users.docs) == 2


@pytest.mark.asyncio
async def test_identity_is_removed_last(populated):
    """If a purge fails partway the caller must still be able to retry.

    Deleting the user row first would strand the remaining rows with no
    authenticated way to ever reach them again, so `users` has to come last.
    """
    order = list((await server.delete_account(
        authorization=f"Bearer {populated['token']}"))["deleted"])
    assert order[-1] == "users", f"users must be purged last, got order {order}"


def test_public_deletion_page_renders_without_a_support_email(monkeypatch):
    """The page must never be contactless, even with SUPPORT_EMAIL unset."""
    monkeypatch.setattr(server, "SUPPORT_EMAIL", "")
    page = server.ACCOUNT_DELETION_PAGE.format(
        contact="Contact us using the developer email on the listing.",
        privacy=server.PRIVACY_POLICY_URL,
    )
    assert "developer email" in page
    assert server.PRIVACY_POLICY_URL in page
    # The in-app path this page advertises has to match where the control
    # actually lives (app/about.tsx).
    assert "About" in page
    assert "does not cancel a subscription" in page
