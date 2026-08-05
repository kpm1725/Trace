# Trace

> AI-assisted circuit debugging companion for hobby electronics, by **Violet Seed Labs**.

Trace lets you (1) photograph a breadboard/schematic + describe a symptom to get AI-diagnosed troubleshooting steps, or (2) describe a circuit in plain text to get a generated diagram, parts list, and wiring instructions.

This is the **initial scaffold** — repo structure, backend skeleton (MongoDB connection + Claude API client), and frontend skeleton (navigation + two stub screens). Full feature logic (AI prompts, structured circuit JSON, billing, native IAP) is intentionally not built yet, per the working agreement to confirm the scaffold first.

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| **Frontend** | Expo SDK 52 · React Native · expo-router · expo-auth-session · expo-image-picker |
| **Backend** | FastAPI · Motor (async MongoDB, pinned to `motor==3.6.0` / `pymongo==4.9.2`) |
| **Database** | MongoDB |
| **LLM** | Claude (`claude-sonnet-5`) via Anthropic Python SDK — vision (photo debug) + text generation |
| **Auth** | Google OAuth — `expo-auth-session` on device, `tokeninfo` verification on server |
| **Payments** | Native IAP (Apple/Google) — **not yet wired**, see flags below |
| **Hosting** | Railway (backend, via `nixpacks.toml`), EAS Build (Android/iOS) |

This mirrors the working pattern from the **Scribe** codebase (`kpm1725/manuscript_to_screenplay`) — same Mongo driver pins, same `extract_text_block()` handling for `ThinkingBlock` responses, same Google OAuth + session-token pattern, same storage/api-client structure on the frontend.

## Project Structure

```
.
├── backend/
│   ├── server.py           # FastAPI app — Mongo connection, Claude client, Google auth
│   ├── requirements.txt
│   ├── nixpacks.toml
│   └── .env.example
├── frontend/
│   ├── app/
│   │   ├── _layout.tsx
│   │   ├── index.tsx           # auth gate
│   │   ├── login.tsx
│   │   ├── oauth2redirect/google.tsx
│   │   └── (tabs)/
│   │       ├── debug.tsx       # Debug from Photo (stub)
│   │       ├── generate.tsx    # Generate from Prompt (stub)
│   │       ├── history.tsx     # Project history (stub)
│   │       └── about.tsx       # Violet Seed Labs credit
│   ├── src/
│   │   ├── api/client.ts
│   │   ├── context/AuthContext.tsx
│   │   ├── theme.ts             # Violet Seed Labs palette, dark by default
│   │   └── utils/storage/
│   ├── app.json
│   ├── eas.json
│   └── package.json
└── README.md
```

## Getting Started

1. **Backend**
   ```bash
   cd backend
   cp .env.example .env   # fill in MONGO_URL, DB_NAME, ANTHROPIC_API_KEY
   pip install -r requirements.txt
   uvicorn server:app --reload
   ```
2. **Frontend**
   ```bash
   cd frontend
   cp .env.example .env   # fill in EXPO_PUBLIC_BACKEND_URL and Google client IDs
   npm install
   npm run start
   ```
3. **Brand assets** — `app.json` references `assets/images/icon.png`, `adaptive-icon.png`, `splash-image.png`, `favicon.png`, none of which exist yet. Add these (violet gradient `#4C1D95` → `#8B5CF6` / lavender `#C4B5FD` on near-black `#1A1428`) before the first EAS build.
4. **Railway** — point a new Railway service at `backend/`, it picks up `nixpacks.toml` automatically. Set the same env vars as `.env.example`.
5. **EAS** — `cd frontend && eas init` to generate a real project ID, paste it into `app.json` → `extra.eas.projectId` (currently a placeholder).

## Open items — flagged before building full feature logic

- **Billing unit not yet decided.** Scribe bills per conversion-chunk. Trace's prompt asked to evaluate per-debug-session vs. per-generation metering and confirm before finalizing — still open.
- **Native IAP / Gradle risk carried over from Scribe, not yet resolved.** Scribe's own `app.json`/`package.json` still contain a *leftover, unused* `react-native-iap@12.16.4` config (with `expo-build-properties` pinning `kotlinVersion: 1.9.25` to work around a KSP/Kotlin mismatch) — but Scribe ultimately shipped with Stripe web checkout instead, not native IAP. That the Kotlin pin didn't clear the way for them to keep native IAP is a signal, not a solved problem. Trace's scaffold does **not** include `react-native-iap` yet on purpose — recommend a standalone EAS build spike (add the library + config plugin, run a preview build, confirm it compiles) before building the purchase flow, so we find out early whether the same conflict resurfaces.
- **Component reference screen** (pinouts/gotchas) — deferred per the MVP scope note; no stub screen yet.
- Backend has no `/api/debug` or `/api/generate` endpoints yet — `anthropic_client` and `extract_text_block()` are ready for them, but the actual vision/generation logic, ranked-cause formatting, structured circuit JSON schema, and session persistence are next.
