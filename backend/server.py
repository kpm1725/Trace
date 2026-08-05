import os
import re
import json
import base64
import uuid
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
import anthropic
from fastapi import (
    FastAPI, APIRouter, HTTPException, Header, Request,
    UploadFile, File, Form,
)
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

from billing import (
    get_entitlement, consume_credit, handle_revenuecat_event,
    CREDIT_PRODUCTS, UNLIMITED_PRODUCT_ID, set_unlimited_until,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]

# RevenueCat — see README for why RevenueCat instead of raw react-native-iap/expo-iap.
REVENUECAT_WEBHOOK_SECRET = os.environ.get("REVENUECAT_WEBHOOK_SECRET", "")
REVENUECAT_SECRET_API_KEY = os.environ.get("REVENUECAT_SECRET_API_KEY", "")
REVENUECAT_UNLIMITED_ENTITLEMENT_ID = os.environ.get("REVENUECAT_UNLIMITED_ENTITLEMENT_ID", "unlimited")

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

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)

def parse_json_loose(raw: str) -> dict:
    """Claude is instructed to respond with pure JSON, but strip markdown code
    fences defensively and fall back to a raw_text payload rather than raising —
    the credit's already been spent, so the user should still get *something*
    back instead of a 500."""
    cleaned = _JSON_FENCE_RE.sub("", raw).strip()
    try:
        return json.loads(cleaned)
    except (json.JSONDecodeError, TypeError):
        log.warning("Failed to parse Claude JSON response, returning raw text")
        return {"parse_error": True, "raw_text": raw}

def ensure_aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

def new_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class GoogleTokenRequest(BaseModel):
    id_token: str

class GenerateRequest(BaseModel):
    description: str


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


# ─── Billing (RevenueCat-backed credits) ─────────────────────────────────────

@api.get("/billing/entitlements")
async def billing_entitlements(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    ent = await get_entitlement(db, user["user_id"])
    return {
        "entitlement": ent,
        "products": {
            "credit_packs": CREDIT_PRODUCTS,
            "unlimited_monthly": UNLIMITED_PRODUCT_ID,
        },
    }

@api.post("/billing/revenuecat-webhook")
async def revenuecat_webhook(request: Request, authorization: Optional[str] = Header(None)):
    if REVENUECAT_WEBHOOK_SECRET:
        expected = REVENUECAT_WEBHOOK_SECRET
        got = (authorization or "").removeprefix("Bearer ").strip()
        if got != expected:
            raise HTTPException(status_code=401, detail="Invalid webhook auth")
    body = await request.json()
    event = body.get("event") or {}
    try:
        status = await handle_revenuecat_event(db, event)
        log.info("RevenueCat webhook handled: %s", status)
    except Exception:
        log.exception("Error handling RevenueCat webhook event: %s", event.get("id"))
    # Always 200 — RevenueCat retries on non-2xx, and we log failures for manual replay.
    return {"ok": True}

@api.post("/billing/sync")
async def billing_sync(authorization: Optional[str] = Header(None)):
    """Best-effort immediate refresh of the unlimited-pass status right after a
    client-side purchase, so the UI doesn't have to wait on webhook latency.
    Consumable credit packs are NOT reconciled here (webhook is authoritative
    for those — see billing.py docstring on why summing purchase history here
    would risk double-crediting)."""
    user = await require_user(authorization)
    if REVENUECAT_SECRET_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=10.0) as hc:
                r = await hc.get(
                    f"https://api.revenuecat.com/v1/subscribers/{user['user_id']}",
                    headers={"Authorization": f"Bearer {REVENUECAT_SECRET_API_KEY}"},
                )
            if r.status_code == 200:
                sub = r.json().get("subscriber", {})
                entitlements = sub.get("entitlements", {})
                unl = entitlements.get(REVENUECAT_UNLIMITED_ENTITLEMENT_ID)
                if unl and unl.get("expires_date"):
                    exp = datetime.fromisoformat(unl["expires_date"].replace("Z", "+00:00"))
                    await set_unlimited_until(db, user["user_id"], exp)
        except Exception:
            log.exception("billing_sync: RevenueCat REST lookup failed, leaving entitlement as-is")
    ent = await get_entitlement(db, user["user_id"])
    return {"entitlement": ent}


# ─── Debug from photo ────────────────────────────────────────────────────────

DEBUG_SYSTEM_PROMPT = """You are Trace, an expert hobby-electronics debugging assistant.
You'll be shown a photo of a breadboard or schematic along with a description of a symptom.
Diagnose the likely fault. Be honest about uncertainty — don't assert a cause you can't
actually see evidence for in the photo.

Respond with ONLY a JSON object, no markdown fences, matching exactly this shape:
{
  "likely_causes": [
    {"cause": "short name", "confidence": "high" | "medium" | "low", "reasoning": "why, referencing what you can see"}
  ],
  "fix_steps": ["step 1", "step 2", ...],
  "confidence_note": "one honest sentence about the limits of what can be diagnosed from a photo alone"
}
List likely_causes ranked most-to-least likely, at most 4."""

@api.post("/debug/photo")
async def debug_photo(
    symptom: str = Form(...),
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    user = await require_user(authorization)
    await consume_credit(db, user["user_id"])

    image_bytes = await file.read()
    media_type = file.content_type or "image/jpeg"
    b64 = base64.b64encode(image_bytes).decode("ascii")

    try:
        resp = await anthropic_client.messages.create(
            model=CLAUDE_MODEL, max_tokens=2048,
            system=DEBUG_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                    {"type": "text", "text": f"Symptom: {symptom.strip()}"},
                ],
            }],
        )
        raw = extract_text_block(resp)
        result = parse_json_loose(raw)
    except anthropic.APIError as e:
        log.exception("Claude vision call failed")
        raise HTTPException(status_code=502, detail=f"AI diagnosis failed: {e}")

    sid = new_id("sess")
    doc = {
        "session_id": sid, "user_id": user["user_id"], "type": "debug",
        "symptom": symptom.strip(), "result": result,
        "created_at": now_utc(),
    }
    await db.sessions.insert_one(doc)
    doc.pop("_id", None)
    return {"session": doc}


# ─── Generate from prompt ────────────────────────────────────────────────────

GENERATE_SYSTEM_PROMPT = """You are Trace, an expert hobby-electronics design assistant.
Given a plain-text circuit description, produce a structured circuit representation
that a mobile app will render client-side — do NOT attempt to draw a diagram yourself.

Respond with ONLY a JSON object, no markdown fences, matching exactly this shape:
{
  "components": [{"id": "u1", "type": "resistor|capacitor|led|ic|transistor|switch|battery|...", "label": "R1 10k"}],
  "nodes": [{"id": "n1", "label": "VCC"}],
  "connections": [{"from": "u1", "to": "n1", "label": "optional signal name"}],
  "parts_list": [{"name": "Resistor", "value": "10k ohm", "qty": 1, "notes": "1/4W"}],
  "wiring_steps": ["step 1", "step 2", ...]
}
Use common, easily-sourced component values. Keep wiring_steps in build order."""

@api.post("/generate")
async def generate_circuit(body: GenerateRequest, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    await consume_credit(db, user["user_id"])

    try:
        resp = await anthropic_client.messages.create(
            model=CLAUDE_MODEL, max_tokens=3000,
            system=GENERATE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": body.description.strip()}],
        )
        raw = extract_text_block(resp)
        result = parse_json_loose(raw)
    except anthropic.APIError as e:
        log.exception("Claude generation call failed")
        raise HTTPException(status_code=502, detail=f"AI generation failed: {e}")

    sid = new_id("sess")
    doc = {
        "session_id": sid, "user_id": user["user_id"], "type": "generate",
        "description": body.description.strip(), "result": result,
        "created_at": now_utc(),
    }
    await db.sessions.insert_one(doc)
    doc.pop("_id", None)
    return {"session": doc}


# ─── Session history ─────────────────────────────────────────────────────────

def _session_summary(s: dict) -> dict:
    if s["type"] == "debug":
        title = s.get("symptom", "")[:80]
    else:
        title = s.get("description", "")[:80]
    return {
        "session_id": s["session_id"], "type": s["type"], "title": title,
        "created_at": s.get("created_at"),
    }

@api.get("/sessions")
async def list_sessions(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    cursor = db.sessions.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(500)
    return {"sessions": [_session_summary(s) for s in items]}

@api.get("/sessions/{sid}")
async def get_session(sid: str, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    s = await db.sessions.find_one({"session_id": sid, "user_id": user["user_id"]}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session": s}


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
    await db.sessions.create_index([("user_id", 1), ("created_at", -1)])
    await db.billing_events.create_index("event_id", unique=True)
    log.info("Trace API ready")

@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()
