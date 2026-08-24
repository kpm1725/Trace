"""Test fixtures.

Scribe's suite is end-to-end: it talks to a running server and a real MongoDB,
with synthetic users injected straight into the database. That catches things
unit tests cannot, and Trace should grow the same suite once there is a deployed
API to point it at.

Until then these tests run with no services at all — no Mongo, no network, no
ANTHROPIC_API_KEY — so they can run in CI from the first commit. `FakeDB` below
implements only the Mongo operators `billing.py` actually uses.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                out = dict(d)
                out.pop("_id", None)
                return out
        return None

    async def update_one(self, query, update):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                for field, delta in update.get("$inc", {}).items():
                    d[field] = d.get(field, 0) + delta
                for field, value in update.get("$set", {}).items():
                    d[field] = value
                # `$max` is how restore extends an entitlement without ever
                # shortening one, so the fake has to honour it or the test
                # would pass on a mechanism that isn't being exercised.
                for field, value in update.get("$max", {}).items():
                    current = d.get(field)
                    d[field] = value if current is None or value > current else current
                for field in update.get("$unset", {}):
                    d.pop(field, None)
                return
        raise AssertionError(f"update_one matched nothing: {query}")

    def find(self, query, projection=None):
        matches = [dict(d) for d in self.docs if all(d.get(k) == v for k, v in query.items())]
        for m in matches:
            m.pop("_id", None)

        class Cursor:
            def __aiter__(self):
                async def gen():
                    for m in matches:
                        yield m

                return gen()

        return Cursor()

    async def insert_one(self, doc):
        self.docs.append(dict(doc))


class FakeDB:
    def __init__(self):
        self._collections = {}

    def __getattr__(self, name):
        return self._collections.setdefault(name, FakeCollection())


@pytest.fixture
def db():
    return FakeDB()


@pytest.fixture
def user(db):
    """A signed-up user with no purchases — five free credits, nothing else."""
    uid = "user_test"
    db.users.docs.append({"user_id": uid, "email": "test@example.com"})
    return uid
