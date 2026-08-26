import pytest
from mongomock_motor import AsyncMongoMockClient


@pytest.fixture
async def db():
    """Fresh in-memory Mongo per test, carrying the same indexes server.py
    creates at startup — the unique index on billing_events.event_id is
    load-bearing for webhook idempotency, so tests must have it too."""
    database = AsyncMongoMockClient()["trace_test"]
    await database.billing_events.create_index("event_id", unique=True)
    return database


@pytest.fixture
async def user(db):
    await db.users.insert_one({
        "user_id": "user_abc123", "email": "a@b.c", "name": "Test",
        "free_credits_used": 0, "paid_credits": 0,
    })
    return "user_abc123"
