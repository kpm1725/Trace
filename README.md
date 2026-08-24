# Trace

> An AI-assisted circuit debugging companion for hobby electronics.
> A [Violet Seed Labs](#violet-seed-labs) app. Built to grow.

Photograph a breadboard, say what it's doing wrong, and get ranked causes with
the one measurement that settles them. Or describe a circuit in plain English
and get a netlist, a parts list, and wiring steps.

**Status: scaffold.** Backend routes, auth, the credit ledger, and both Claude
calls are implemented and tested. The two result views and the diagram renderer
are not — see [What's not built yet](#whats-not-built-yet).

---

## Stack

| Layer | Stack |
|-------|-------|
| **Frontend** | Expo SDK 57 · React Native 0.86 · expo-router · expo-auth-session · expo-image-picker |
| **Backend** | FastAPI · Motor (async MongoDB) · Pydantic v2 |
| **Database** | MongoDB (Atlas) |
| **LLM** | Claude Sonnet 5 via the Anthropic Python SDK — vision and structured outputs |
| **Payments** | Native IAP — Apple IAP and Google Play Billing via RevenueCat, fulfilled by webhook |
| **Auth** | Google OAuth — `expo-auth-session` on device, `tokeninfo` verification on the server |
| **Hosting** | Railway (backend), EAS Build (iOS/Android) |

This mirrors [Scribe](https://github.com/kpm1725/manuscript_to_screenplay), which
runs the same stack in production. Three things differ, each on purpose:

1. **Expo SDK 57, not 52.** Scribe's README says 52; its `package.json` says
   `expo: ~57.0.11`. The code is the truth — the README is stale.
2. **Structured outputs instead of prompt-and-parse.** Scribe asks for JSON in
   the prompt and parses what comes back. Trace's payload drives a renderer, so
   `output_config.format` makes the API enforce the schema. See `backend/ai.py`.
3. **Lifespan instead of `@app.on_event`.** Scribe's form is deprecated in the
   pinned FastAPI version and raises a `DeprecationWarning` at import.

---

## Project structure

```
.
├── backend/
│   ├── server.py               # routes — auth, sessions, AI, billing reads
│   ├── ai.py                   # Claude client, prompts, response parsing
│   ├── schemas.py              # structured-output schemas (the renderer's contract)
│   ├── billing.py              # credit ledger and gates
│   ├── revenuecat_webhook.py   # native IAP fulfilment
│   ├── requirements.txt
│   ├── nixpacks.toml           # Railway build
│   └── tests/                  # run with no Mongo, no network, no API key
└── frontend/
    ├── app/                    # expo-router routes
    │   ├── _layout.tsx
    │   ├── index.tsx           # auth gate
    │   ├── login.tsx
    │   ├── home.tsx            # the two entry points + credit balance
    │   ├── debug.tsx           # Debug from photo
    │   ├── generate.tsx        # Generate from prompt
    │   ├── history.tsx         # saved sessions, both kinds, one list
    │   ├── session/[id].tsx
    │   ├── reference.tsx       # deferred to v1.1
    │   └── about.tsx
    ├── src/
    │   ├── api/client.ts       # apiFetch + ApiError (402 carries paywall numbers)
    │   ├── context/AuthContext.tsx
    │   ├── billing/products.ts # RevenueCat ids, mirroring the backend grant tables
    │   ├── components/VioletSeedLabs.tsx
    │   ├── types.ts            # mirrors backend/schemas.py
    │   └── theme.ts
    ├── scripts/brand-assets.py # regenerates the placeholder icon and splash
    ├── app.json
    └── eas.json
```

---

## The two AI calls

Both run on `claude-sonnet-5` and both use structured outputs, so the response
is schema-valid JSON rather than prose to be parsed.

**Debug from photo** (`POST /api/debug`) takes a base64 JPEG and a symptom.
The response ranks causes, and every one carries its own `confidence` plus the
single `how_to_check` that confirms or rules it out. `cannot_tell_from_photo` is
a required field, which is the mechanism behind the product promise: the model
cannot return a diagnosis without also stating what the photograph could not
settle. A still image cannot show continuity, a cold joint, or a blown part, and
the schema makes saying so structural rather than a matter of prompt discipline.

**Generate from prompt** (`POST /api/generate`) takes a description and returns
a **netlist** — components with named pins, and nets joining those pins — plus a
parts list and ordered wiring steps. Claude is never asked to draw anything. The
netlist is the circuit's actual topology, and the client renders it.

### Rendering the netlist

This is the largest single piece of work left, and it is worth being honest
about the size of it. A netlist is a graph; a schematic is a *drawing* of that
graph, and turning one into the other automatically is a real problem — EDA
tools have worked at it for decades and still ship manual placement.

The plan is to render a **breadboard-style block-and-wire view**, not a proper
schematic: components as labelled boxes in a simple layered layout, nets as
orthogonal wires, power and ground as rails top and bottom. That is achievable,
reads well on a phone, and matches what a hobbyist is actually looking at. A
schematic-quality renderer with symbol glyphs and routed nets is a v2 project on
its own. `react-native-svg` is installed and version-matched for this.

---

## Monetization

Native in-app purchases through **RevenueCat**, which wraps Apple IAP and Google
Play Billing. The app never asserts its own entitlements — RevenueCat POSTs to
`/api/webhook/revenuecat` and the server credits the account. Fulfilment is
server-side because a client that can grant itself credits will.

RevenueCat rather than `expo-in-app-purchases` (discontinued — last npm release
about three years ago, and removed from Expo's own docs) or `react-native-iap`
direct (which would mean writing receipt validation against both Apple and
Google from scratch). Scribe already ships RevenueCat in production, so the
webhook, the idempotency guard, and the `productId:basePlanId` normalisation
here are a port of code that works rather than a first attempt.

The ledger in `backend/billing.py` mirrors Scribe's chunk billing: a lifetime
free allowance, a prepaid balance bought as consumables, and a time-boxed
unlimited pass, checked in that order.

**The billing unit is a weighted single balance.** One pool of credits, priced
by what the call costs to serve:

| Call | Credits |
|---|---|
| Debug from photo | 1 |
| Generate from prompt | 2 |

A generation writes a full netlist, parts list and wiring steps and runs 2–3×
the tokens of a diagnosis, so a flat rate would have priced them the same for
materially different cost. Separate per-feature balances — Scribe's shape, where
coverage credits and chunk credits never mix — were the other option, but they
mean more SKUs and a user holding the wrong balance hitting a wall. One pool
means a pack bought for one tool is spendable on the other.

New accounts get 5 free credits for life: five diagnoses, or two generations and
a diagnosis. A charge may straddle the free and paid balances, so the last free
credit is never stranded.

`CREDIT_COST` in `billing.py` is the whole pricing model — every gate reads it,
and `refund_credits` reverses whatever it charged. The product ids in
`revenuecat_webhook.py` and `frontend/src/billing/products.ts` are two halves of
one contract and must stay in step: a product missing from either side can never
be bought or never be credited.

---

## The Gradle fix

Scribe hit a Gradle failure with its native IAP dependency, and the fix is
already in Scribe — carried here from the start rather than rediscovered.

`android/` and `ios/` are in **both** `.gitignore` and `.easignore`. Keeping
them out of the EAS upload forces a fresh `expo prebuild` on the build server,
so the Gradle wrapper always matches the SDK. A stale local `android/` folder
from an older SDK ships its own wrapper, which then collides with what the
current SDK and its native dependencies expect. `expo-build-properties` pins
`compileSdkVersion`/`targetSdkVersion` to 36 in `app.json` for the same reason.

Do not commit `android/` or `ios/`, and do not remove those `.easignore` lines.

Dependency compatibility is verified rather than assumed: `expo install`
resolved `react-native-purchases@^10.7.2`, `react-native-svg@15.15.4`,
`expo-image-picker@~57.0.13`, and `expo-image-manipulator@~57.0.13` together
with no peer conflicts, and `expo-doctor` passes its version check.

---

## Getting started

```bash
# Backend
cd backend
python -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env          # fill in MONGO_URL, ANTHROPIC_API_KEY, GOOGLE_CLIENT_IDS
.venv/bin/python -m pytest    # 25 tests, no services needed
.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend
cd frontend
npm install
cp .env.example .env          # fill in EXPO_PUBLIC_BACKEND_URL and the Google client IDs
npx expo start
```

Builds are EAS cloud builds only — there is no local build pipeline:

```bash
eas build --profile preview --platform android
```

`expo-image-picker` and `react-native-purchases` are native modules, so **Expo
Go cannot run this app**. Use a development build:

```bash
eas build --profile development --platform android
```

---

## API

All routes are prefixed `/api` and take `Authorization: Bearer <session_token>`
unless noted.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/google` | Exchange a Google ID token for a Trace session token |
| `GET` | `/auth/me` | The current user |
| `POST` | `/auth/logout` | Invalidate the session |
| `DELETE` | `/auth/account` | Delete the account and all its data |
| `POST` | `/debug` | Diagnose a board from a photo (1 credit) |
| `POST` | `/generate` | Generate a circuit from a description (1 credit) |
| `GET` | `/sessions` | Saved sessions, newest first, without `result` |
| `GET / PATCH / DELETE` | `/sessions/{sid}` | One saved session |
| `GET` | `/billing/entitlements` | Credit balance and unlimited state |
| `POST` | `/webhook/revenuecat` | RevenueCat webhook — fulfils purchases (no auth header) |

---

## What's not built yet

- **The diagnosis and circuit result views.** Both screens render their result
  as plain text so the round trip is testable; the designed views, shared with
  `session/[id].tsx`, are next.
- **The diagram renderer.** See [above](#rendering-the-netlist).
- **The paywall and the purchase flow.** `useRevenueCat`, the paywall sheet, and
  restore-purchases are all waiting on the billing unit.
- **Restore purchases.** Scribe's `/api/billing/restore` reads the subscriber
  from RevenueCat under the caller's own id; port it once products exist.
- **Component reference** — deferred to v1.1, per the MVP scope. The screen
  exists so navigation is complete.
- **Brand assets.** `frontend/assets/images/` holds generated placeholders.
  Replace before either store submission; `scripts/brand-assets.py` regenerates
  them.
- **iOS.** The bundle identifier and Info.plist strings are set, but shipping
  needs an Apple Developer account and a RevenueCat Apple key. Scribe never
  cleared this step.

---

## Violet Seed Labs

Trace is a Violet Seed Labs app. *Built to grow.*

| | |
|---|---|
| Bundle ID / package | `com.violetseedlabs.trace` |
| Palette | `#4C1D95` → `#8B5CF6` gradient, `#C4B5FD` accent, `#1A1428` ground, `#FAF9FB` type |

Dark is the only theme. `src/theme.ts` carries the tokens under the same names
Scribe uses, so a component moves between the two apps without a rename.
