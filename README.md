# Trace

> AI-assisted circuit debugging companion for hobby electronics, by **Violet Seed Labs**.

Trace lets you (1) photograph a breadboard/schematic + describe a symptom to get AI-diagnosed troubleshooting steps, or (2) describe a circuit in plain text to get a generated circuit structure, parts list, and wiring instructions.

Both core flows are fully wired end to end: photo → Claude vision → ranked causes; prompt → Claude → structured circuit JSON rendered client-side. Billing is real native IAP via RevenueCat, credit-metered.

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| **Frontend** | Expo SDK 52 · React Native · expo-router · expo-auth-session · expo-image-picker |
| **Backend** | FastAPI · Motor (async MongoDB, pinned to `motor==3.6.0` / `pymongo==4.9.2`) |
| **Database** | MongoDB |
| **LLM** | Claude (`claude-sonnet-5`) via Anthropic Python SDK — vision (photo debug) + text generation |
| **Auth** | Google OAuth — `expo-auth-session` on device, `tokeninfo` verification on server |
| **Payments** | Native IAP (Apple/Google) mediated through **RevenueCat** (`react-native-purchases`) |
| **Hosting** | Railway (backend, via `nixpacks.toml`), EAS Build (Android/iOS) |

This mirrors the working pattern from the **Scribe** codebase (`kpm1725/manuscript_to_screenplay`) — same Mongo driver pins, same `extract_text_block()` handling for `ThinkingBlock` responses, same Google OAuth + session-token pattern, same storage/api-client structure and icon-font loading workaround on the frontend. Payments diverge from Scribe on purpose — see below.

## Billing unit — decided

**1 credit = 1 AI action** (one photo-debug *or* one prompt-generation). Unlike Scribe's long-manuscript conversion, which naturally splits into many chunks worth metering individually, both of Trace's actions are a single, comparably-sized Claude call with no natural sub-unit — so per-session and per-generation collapse into one unified credit pool rather than two separate meters.

- **Free tier:** 5 credits per account, lifetime (mirrors Scribe's `FREE_CHUNKS = 5`).
- **Credit packs (consumable):** `trace_credits_10` — 10 credits / $2.99, `trace_credits_40` — 40 credits / $8.99 (better per-credit value).
- **Unlimited pass (auto-renewing subscription):** `trace_unlimited_monthly` — $9.99/mo, unmetered debug + generate while active.

Product IDs are defined in `backend/billing.py` (`CREDIT_PRODUCTS`, `UNLIMITED_PRODUCT_ID`) — create matching products in App Store Connect / Google Play Console and RevenueCat with these exact identifiers. Prices are a starting default, easy to tune later.

## Native IAP — why RevenueCat instead of raw react-native-iap / expo-iap

The original plan (per the working spec) was `react-native-iap` or `expo-in-app-purchases`. Before scaffolding a purchase flow on top of either, I did the compatibility spike the spec asked for, and it surfaced a live, unresolved problem — not the same "add a Kotlin pin" fix Scribe already tried:

- **`expo-in-app-purchases`** has been deprecated by Expo for a while — not a real option.
- **`expo-iap`** (the modern Expo-recommended successor to `react-native-iap` for managed apps) currently has a hard Kotlin/Gradle deadlock on Expo SDK 52: versions ≥3.1 depend on Google Play Billing Library ≥8.1, which requires Kotlin ≥2.2, but SDK 52's React Native Gradle plugin only works with Kotlin 1.9.x — bumping Kotlin to satisfy Billing breaks the RN Gradle plugin itself (`KotlinTopLevelExtension` changed from a class to an interface in Kotlin 2.x). The only reported workaround is downgrading to `expo-iap@3.0.0` (Billing 8.0.x / Kotlin 2.0.21), which still doesn't cleanly match SDK 52's Kotlin 1.9.x baseline. **The `expo-iap` repository was archived by its maintainer on August 4, 2026** — the day before this was written — so this is now unmaintained.
- This is consistent with what's still sitting, unused, in Scribe's own `app.json`/`package.json`: a `react-native-iap` + `kotlinVersion: 1.9.25` pin that didn't end up being enough for them to ship native IAP — they shipped Stripe web checkout instead. The ecosystem got worse for this approach since then, not better.

**Decision: `react-native-purchases` (RevenueCat)** instead. Verified directly, not just from docs:
- Its `android/build.gradle` (inspected in `node_modules` after install) declares `implementation 'com.revenuecat.purchases:purchases-hybrid-common:18.28.0'` and otherwise **defers entirely to the host app's own `kotlinVersion`** rather than forcing a Kotlin bump the way `expo-iap`'s Billing v8 dependency does — it doesn't create the same deadlock.
- Minimum requirements are modest: React Native ≥0.73.0, Kotlin ≥1.8.0 — both already satisfied by SDK 52 (RN 0.76.7) with no pin needed.
- No Expo config plugin is required (confirmed: no `app.plugin.js`/`expo-module.config.json` in the installed package) — it autolinks normally.
- `npx tsc --noEmit` and `npx expo-doctor` both pass clean with it installed (the only expo-doctor findings that remain are network-blocked SDK-version lookups in this sandboxed environment, not real project issues).
- It also collapses what would otherwise be custom Apple/Google receipt-verification code in the backend into RevenueCat's own server-side verification — `backend/billing.py` + the webhook/sync endpoints in `server.py` only have to trust RevenueCat's webhook, not re-implement `verifyReceipt` / Play Developer API calls.

**Trade-off, on purpose surfaced rather than silently decided:** RevenueCat is a third-party vendor with a revenue share — free up to $2,500/mo tracked revenue, 1% above that. For an MVP this is effectively free, and it buys out of an ecosystem-level build problem that just got worse (an actively-recommended library archived within the last day). If a later profile makes the revenue share unattractive, `react-native-purchases` can be swapped for direct store billing without touching the credit-ledger logic in `billing.py` — only the purchase/verification layer would change.

**What I could not verify from this environment:** I don't have an EAS/Expo account or an Android/iOS build toolchain here, so I could not run an actual `eas build` to confirm the app compiles end to end. What I *did* verify: `npm install` succeeds, `npx tsc --noEmit` passes with zero errors across the whole frontend (including RevenueCat's types), `npx expo config` resolves `app.json` cleanly, and the installed native module's Gradle file doesn't force a Kotlin version. Run `eas build --profile preview --platform android` as the real verification step before shipping — if `KotlinTopLevelExtension` or a Billing-KTX metadata-version error shows up anyway, something in this analysis was wrong and it's worth reopening.

## Project Structure

```
.
├── backend/
│   ├── server.py            # FastAPI app — auth, debug/generate, sessions, billing
│   ├── billing.py           # Credit ledger + RevenueCat webhook handling
│   ├── requirements.txt
│   ├── nixpacks.toml
│   └── .env.example
├── frontend/
│   ├── app/
│   │   ├── _layout.tsx
│   │   ├── index.tsx            # auth gate
│   │   ├── login.tsx
│   │   ├── oauth2redirect/google.tsx
│   │   ├── session/[id].tsx     # session detail (debug or generate result)
│   │   └── (tabs)/
│   │       ├── debug.tsx        # Debug from Photo — wired to /api/debug/photo
│   │       ├── generate.tsx     # Generate from Prompt — wired to /api/generate
│   │       ├── history.tsx      # Project history — wired to /api/sessions
│   │       └── about.tsx        # Violet Seed Labs credit + credit balance + upgrade
│   ├── src/
│   │   ├── api/client.ts        # apiFetch (JSON) + apiFetchForm (multipart)
│   │   ├── context/AuthContext.tsx
│   │   ├── context/BillingContext.tsx   # RevenueCat SDK wrapper
│   │   ├── components/Paywall.tsx
│   │   ├── components/DebugResult.tsx
│   │   ├── components/CircuitResult.tsx
│   │   ├── hooks/use-icon-fonts.ts
│   │   ├── theme.ts              # Violet Seed Labs palette, dark by default
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
   cp .env.example .env   # fill in MONGO_URL, DB_NAME, ANTHROPIC_API_KEY, RevenueCat vars
   pip install -r requirements.txt
   uvicorn server:app --reload
   ```
2. **Frontend**
   ```bash
   cd frontend
   cp .env.example .env   # fill in EXPO_PUBLIC_BACKEND_URL, Google client IDs, RevenueCat public keys
   npm install
   npm run start
   ```
   Real purchases require a **development build**, not Expo Go — `react-native-purchases` contains native code. Run `eas build --profile development --platform android` (or `ios`) once EAS is set up, or `npx expo run:android` locally.
3. **RevenueCat setup**
   - Create a RevenueCat project, link your App Store Connect and Google Play Console apps.
   - Create products matching `backend/billing.py`'s IDs: `trace_credits_10`, `trace_credits_40` (consumable), `trace_unlimited_monthly` (subscription).
   - Create an entitlement (default name `unlimited`, matches `REVENUECAT_UNLIMITED_ENTITLEMENT_ID`) attached to the subscription product, and an Offering with all three as packages.
   - Copy the iOS and Android **public** SDK keys into `frontend/.env`.
   - Under Project Settings → Integrations → Webhooks, point a webhook at `<your-backend>/api/billing/revenuecat-webhook` and set an Authorization header value — put the same value in `backend/.env` as `REVENUECAT_WEBHOOK_SECRET`.
   - Copy the **secret** API key into `backend/.env` as `REVENUECAT_SECRET_API_KEY` (used only for the best-effort `/api/billing/sync` lookup — never ship this to the app).
4. **Brand assets** — `app.json` references `assets/images/icon.png`, `adaptive-icon.png`, `splash-image.png`, `favicon.png`, none of which exist yet. Add these (violet gradient `#4C1D95` → `#8B5CF6` / lavender `#C4B5FD` on near-black `#1A1428`) before the first EAS build.
5. **Railway** — point a new Railway service at `backend/`, it picks up `nixpacks.toml` automatically. Set the same env vars as `.env.example`.
6. **EAS** — `cd frontend && eas init` to generate a real project ID, paste it into `app.json` → `extra.eas.projectId` (currently a placeholder).

## Known simplifications / good next steps

- **Circuit diagrams are rendered as structured lists** (components / connections / parts / wiring steps), not a positioned SVG schematic. Claude still outputs structured JSON as required — `CircuitResult.tsx` is the natural place to grow into a real wired-diagram layout later.
- **No custom app fonts** — theme uses the system font. The icon-font CDN workaround (`use-icon-fonts.ts`) is still needed and is in place, since `@expo/vector-icons` is used throughout.
- **Component reference screen** (pinouts/gotchas) — still deferred per the original MVP scope note.
- **`/api/billing/sync` only reconciles the unlimited subscription**, not consumable credit packs (see `billing.py` docstring for why summing purchase history would risk double-crediting) — consumables rely on the webhook, which is idempotent per RevenueCat event id.
