"""Trace API — AI-assisted circuit debugging for hobby electronics.

Violet Seed Labs. Built to grow.

Layout follows Scribe's backend, which is deployed on the same stack (Railway,
MongoDB Atlas, Anthropic) and has already been through Play Console review:

    server.py               routes — auth, sessions, AI, billing reads
    ai.py                   Claude client, prompts, response parsing
    schemas.py              structured-output schemas (the renderer's contract)
    billing.py              credit ledger and gates
    revenuecat_webhook.py   native IAP fulfilment

Routes stay thin on purpose. A route authorises, meters, calls into `ai`, and
persists. Anything longer than that belongs in a module beside it.
"""
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, Header, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

import ai
import billing
from revenuecat_webhook import (
    router as revenuecat_router,
    ensure_indexes as ensure_revenuecat_indexes,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# Every Google OAuth client id the app may present. Configuration rather than a
# constant in this file: adding the iOS client id should be a Railway variable
# change, not a deploy. A token whose `aud` is not in this list is rejected.
VALID_GOOGLE_CLIENT_IDS = [
    c.strip() for c in os.environ.get("GOOGLE_CLIENT_IDS", "").split(",") if c.strip()
]

SUPPORT_EMAIL = os.environ.get("SUPPORT_EMAIL", "")

# Collections keyed to a user_id. Account deletion and index creation both read
# this, so a new collection cannot be added to one and forgotten by the other —
# the failure mode there is orphaned user data surviving a deletion request.
USER_COLLECTIONS = ("sessions",)

mongo_client = AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Create indexes at boot.

    Scribe uses `@app.on_event("startup")`, which this FastAPI version has
    deprecated — it raises a DeprecationWarning on import. Same work, current
    API. Carry this back to Scribe when its backend next unfreezes.
    """
    if not VALID_GOOGLE_CLIENT_IDS:
        # Not fatal — the service still serves health checks — but every
        # sign-in will 401, and that is worth one loud line at boot rather than
        # a stream of confusing auth failures.
        log.error("GOOGLE_CLIENT_IDS is empty; every Google sign-in will fail.")
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("email", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.sessions.create_index([("user_id", 1), ("created_at", -1)])
    await ensure_revenuecat_indexes(db)
    log.info("Trace API ready")
    yield


app = FastAPI(title="Trace API", lifespan=lifespan)
app.state.db = db
api = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("trace")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def ensure_aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def new_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ── Request models ───────────────────────────────────────────────────────────

class GoogleTokenRequest(BaseModel):
    id_token: str


class DebugRequest(BaseModel):
    """A board photo plus the symptom to explain.

    The image arrives as base64 in JSON rather than as multipart. Scribe uploads
    manuscripts as multipart because they stream to disk and can be 50MB; a
    board photo is resized client-side to well under the API's ~5MB per-image
    ceiling before it is sent, so JSON keeps the route simple.
    """
    image_base64: str
    media_type: str = "image/jpeg"
    symptom: str = Field(min_length=1)
    context: Optional[str] = ""
    title: Optional[str] = ""


class GenerateRequest(BaseModel):
    description: str = Field(min_length=1)
    title: Optional[str] = ""


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None


# ── Auth ─────────────────────────────────────────────────────────────────────

async def verify_google_token(id_token: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as hc:
        r = await hc.get("https://oauth2.googleapis.com/tokeninfo",
                         params={"id_token": id_token})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token")
    data = r.json()
    if data.get("aud") not in VALID_GOOGLE_CLIENT_IDS:
        raise HTTPException(status_code=401, detail="Token audience mismatch")
    return data


async def get_user_from_token(token: str) -> Optional[dict]:
    if not token:
        return None
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    if ensure_aware(sess["expires_at"]) < now_utc():
        await db.user_sessions.delete_one({"session_token": token})
        return None
    return await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})


async def require_user(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    user = await get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


@api.post("/auth/google")
async def auth_google(body: GoogleTokenRequest):
    google_data = await verify_google_token(body.id_token)
    email = google_data["email"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {
            "name": google_data.get("name", existing.get("name", "")),
            "picture": google_data.get("picture", existing.get("picture", "")),
        }})
    else:
        user_id = new_id("user")
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": google_data.get("name", ""),
            "picture": google_data.get("picture", ""),
            "created_at": now_utc(),
        })
    session_token = f"trace_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": now_utc() + timedelta(days=30),
        "created_at": now_utc(),
    })
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user, "session_token": session_token}


@api.get("/auth/me")
async def me(authorization: Optional[str] = Header(None)):
    return {"user": await require_user(authorization)}


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        await db.user_sessions.delete_one(
            {"session_token": authorization.split(" ", 1)[1].strip()})
    return {"ok": True}


@api.delete("/auth/account")
async def delete_account(authorization: Optional[str] = Header(None)):
    """Permanently delete the caller's account and all data belonging to it.

    Required by both stores for any app that creates accounts.

    Identity is removed LAST. If a purge fails partway the caller still holds a
    valid session and can retry; deleting the user first would strand the
    remaining rows with no authenticated way to ever reach them again.
    """
    user = await require_user(authorization)
    uid = user["user_id"]
    deleted: dict = {}

    for coll in USER_COLLECTIONS:
        deleted[coll] = (await db[coll].delete_many({"user_id": uid})).deleted_count

    # Purchase records are keyed by the RevenueCat app_user_id, which is the
    # same value. Leaving them behind would keep transaction rows tied to a
    # deleted person.
    deleted["revenuecat_events"] = (
        await db.revenuecat_events.delete_many({"app_user_id": uid})).deleted_count
    deleted["user_sessions"] = (
        await db.user_sessions.delete_many({"user_id": uid})).deleted_count
    deleted["users"] = (await db.users.delete_many({"user_id": uid})).deleted_count

    log.info("Deleted account %s: %s", uid, deleted)
    return {"ok": True, "deleted": deleted}


# ── Sessions (project history) ───────────────────────────────────────────────
#
# One collection holds both kinds of work, discriminated by `kind`. They share
# every field the history list renders — title, timestamp, a one-line summary —
# and differ only in `result`, whose shape is the schema in schemas.py that
# produced it. Two collections would mean two queries and a merge sort to build
# one reverse-chronological list.

@api.get("/sessions")
async def list_sessions(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    cursor = db.sessions.find(
        {"user_id": user["user_id"]},
        # The full result can run to a few KB of netlist. The list screen shows
        # none of it, so it is not sent.
        {"_id": 0, "result": 0},
    ).sort("created_at", -1).limit(200)
    return {"sessions": [s async for s in cursor]}


@api.get("/sessions/{sid}")
async def get_session(sid: str, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    s = await db.sessions.find_one(
        {"session_id": sid, "user_id": user["user_id"]}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session": s}


@api.patch("/sessions/{sid}")
async def update_session(sid: str, body: SessionUpdate,
                         authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if not upd:
        return await get_session(sid, authorization)
    upd["updated_at"] = now_utc()
    res = await db.sessions.update_one(
        {"session_id": sid, "user_id": user["user_id"]}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return await get_session(sid, authorization)


@api.delete("/sessions/{sid}")
async def delete_session(sid: str, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    res = await db.sessions.delete_one({"session_id": sid, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


async def _save_session(user_id: str, kind: str, title: str,
                        prompt: dict, result: dict) -> dict:
    doc = {
        "session_id": new_id("sess"),
        "user_id": user_id,
        "kind": kind,
        "title": title,
        "prompt": prompt,
        "result": result,
        "notes": "",
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    await db.sessions.insert_one(dict(doc))
    return doc


# ── AI ───────────────────────────────────────────────────────────────────────

@api.post("/debug")
async def debug_from_photo(body: DebugRequest,
                           authorization: Optional[str] = Header(None)):
    """Diagnose a board from a photo and a described symptom."""
    user = await require_user(authorization)
    spent = await billing.consume_credits(db, user["user_id"], "debug_session")

    try:
        result = await ai.diagnose_photo(
            image_base64=body.image_base64,
            media_type=body.media_type,
            symptom=body.symptom,
            context=body.context,
        )
    except ai.AIError as e:
        # The call is what was paid for. If it failed, the credit goes back —
        # including when it came out of a purchased balance.
        await billing.refund_credits(db, user["user_id"], spent)
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    # The photo itself is not stored. It is the largest thing in the request and
    # the least useful later: the diagnosis quotes what it saw in `observation`,
    # and a board someone photographed in their kitchen is not something to
    # retain by default. Revisit only if re-diagnosis from history is wanted.
    session = await _save_session(
        user_id=user["user_id"],
        kind="debug",
        title=body.title or body.symptom[:80],
        prompt={"symptom": body.symptom, "context": body.context or ""},
        result=result,
    )
    return {"session": session, "spent": spent}


@api.post("/generate")
async def generate_from_prompt(body: GenerateRequest,
                               authorization: Optional[str] = Header(None)):
    """Generate a circuit — netlist, parts list, wiring steps — from a description."""
    user = await require_user(authorization)
    spent = await billing.consume_credits(db, user["user_id"], "circuit_generation")

    try:
        result = await ai.generate_circuit(body.description)
    except ai.AIError as e:
        await billing.refund_credits(db, user["user_id"], spent)
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")

    session = await _save_session(
        user_id=user["user_id"],
        kind="circuit",
        title=body.title or result.get("title") or body.description[:80],
        prompt={"description": body.description},
        result=result,
    )
    return {"session": session, "spent": spent}


# ── Billing (read-only; purchases are native, fulfilled by the webhook) ───────

@api.get("/billing/entitlements")
async def entitlements(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    return await billing.get_entitlement(db, user["user_id"])


# ── Lifecycle ────────────────────────────────────────────────────────────────

app.include_router(api)
app.include_router(revenuecat_router, prefix="/api/webhook")


@app.get("/health")
async def health():
    return {"ok": True, "service": "trace", "company": "Violet Seed Labs"}
