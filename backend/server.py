import os
import uuid
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
import anthropic
from fastapi import FastAPI, APIRouter, HTTPException, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]

# aud values accepted on Google id_token verification — fill in from
# Google Cloud Console once OAuth clients exist for Trace (see .env.example).
VALID_GOOGLE_CLIENT_IDS = [
    cid for cid in [
        os.environ.get("GOOGLE_WEB_CLIENT_ID", ""),
        os.environ.get("GOOGLE_ANDROID_CLIENT_ID", ""),
        os.environ.get("GOOGLE_IOS_CLIENT_ID", ""),
    ] if cid
]

# Claude model used for both vision (photo debugging) and text generation.
# claude-sonnet-5 chosen per project decision on 2026-08-05.
CLAUDE_MODEL = "claude-sonnet-5"

anthropic_client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
mongo_client = AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]

app = FastAPI(title="Trace API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("trace")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def extract_text_block(resp) -> str:
    """Anthropic responses can include ThinkingBlock objects before the TextBlock
    (e.g. with extended thinking enabled). This pulls out the actual text content,
    skipping any non-text blocks — same handling as Scribe's server.py."""
    if not resp.content:
        return ""
    for block in resp.content:
        if getattr(block, "type", None) == "text":
            return block.text
    return ""

def ensure_aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

def new_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class GoogleTokenRequest(BaseModel):
    id_token: str


async def verify_google_token(id_token: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0) as hc:
        r = await hc.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": id_token})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token")
    data = r.json()
    if VALID_GOOGLE_CLIENT_IDS and data.get("aud") not in VALID_GOOGLE_CLIENT_IDS:
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
            "user_id": user_id, "email": email,
            "name": google_data.get("name", ""),
            "picture": google_data.get("picture", ""),
            "created_at": now_utc(),
        })
    session_token = f"trace_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": session_token, "user_id": user_id,
        "expires_at": now_utc() + timedelta(days=30),
        "created_at": now_utc(),
    })
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user, "session_token": session_token}

@api.get("/auth/me")
async def me(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    return {"user": user}

@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ─── Debug-from-photo and Generate-from-prompt endpoints ────────────────────
# Deliberately not implemented yet. The Mongo connection and Claude client
# above are wired and ready (extract_text_block is here so the vision-debug
# endpoint can reuse it), but the actual request/response shape, ranked-cause
# formatting, structured circuit JSON schema, and session persistence are
# "full feature logic" — scaffold confirmation happens before that's built.


@api.get("/")
async def root():
    return {"app": "trace", "ok": True}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    log.info("Trace API ready")

@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()
