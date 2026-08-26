# Trace

> An AI-assisted circuit debugging companion for hobby electronics.
> A [Violet Seed Labs](#violet-seed-labs) app. Built to grow.

Photograph a breadboard, say what it's doing wrong, and get ranked causes with
the one measurement that settles them. Or describe a circuit in plain English
and get a netlist, a parts list, and wiring steps.

**Status: pre-alpha.** Every MVP feature is implemented — auth, both Claude
calls, both result views, the circuit diagram, the credit ledger, the purchase
flow, and the store-compliance surface — with 44 backend tests, 51 frontend
tests, the diagram layout under its own checks, and lint and typecheck clean. What remains is store and account setup rather than
code; see [What's not built yet](#whats-not-built-yet).

Nothing here has run on a device or against a live backend yet. It typechecks
and its tests pass, which is not the same thing.

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
runs the same stack in production — same layout, same auth flow, same billing
shape, same EAS configuration.

One thing is genuinely new here: **structured outputs**. Both Claude calls set
`output_config.format`, so the API enforces the response schema rather than the
prompt asking for JSON and the server parsing whatever arrives. The payload
drives a renderer, where a missing key is a blank screen. See `backend/ai.py`.

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
├── docs/                       # privacy policy + deletion page (host these)
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
    │   ├── circuit/layout.ts   # netlist -> coordinates. Pure, no React.
    │   ├── hooks/
    │   │   ├── use-revenuecat.ts   # SDK config, identity binding, purchase, restore
    │   │   └── use-entitlement.ts  # balance + post-purchase polling
    │   ├── components/
    │   │   ├── ui.tsx              # SectionHeading, Callout, Collapsible, Chip
    │   │   ├── Paywall.tsx         # one sheet; prices read from the store
    │   │   ├── DeleteAccountDialog.tsx
    │   │   ├── CircuitDiagram.tsx  # draws layout.ts's output as SVG
    │   │   ├── DiagnosisResult.tsx # shared by debug.tsx and session/[id].tsx
    │   │   ├── CircuitResult.tsx   # shared by generate.tsx and session/[id].tsx
    │   │   └── VioletSeedLabs.tsx
    │   ├── links.ts            # public URLs, defined once
    │   ├── types.ts            # mirrors backend/schemas.py
    │   └── theme.ts
    ├── scripts/
    │   ├── brand-assets.py     # regenerates the placeholder icon and splash
    │   └── diagram-check.js    # layout invariants + SVG previews
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

A netlist is a graph; a schematic is a *drawing* of that graph, and turning one
into the other automatically is a real problem — EDA tools have worked at it for
decades and still ship manual placement. Trace does not attempt a symbol
schematic. It draws a **rail-and-ladder diagram**, which is the layout a
hobbyist sketches on paper:

- **Power and ground become horizontal rails**, top and bottom, rather than
  ordinary nets. On a small circuit that removes most of the wires, and it
  matches how these are read — up is positive, down is ground.
- **One component per row**, full width. The canvas comes out tall and narrow,
  which is the shape of a phone, and the page already scrolls vertically.
- **Every signal net gets a vertical trunk in a side lane.** Nets whose vertical
  spans don't overlap share a lane, so the margins stay narrow. Wires meet pins
  at right angles, and a junction dot marks a real connection — a crossing
  without one is not connected, per the usual convention.

Rail pins do **not** drop straight to their rail. They step out into the gap
beside their row, run to a riser outside every signal lane, and climb from
there. A straight drop crosses whatever boxes lie between, and since a box is
opaque the wire appears to terminate at it — a diagram that invents a
connection is worse than one that is merely ugly.

The split is the important part: `src/circuit/layout.ts` is pure and takes a
`Circuit` to coordinates, and `src/components/CircuitDiagram.tsx` only turns
those coordinates into SVG. So the hard half runs in plain node:

```bash
npm run diagram:check            # invariants over four fixtures
npm run diagram:check -- --svg   # also write previews to .diagram/
```

The checks assert what actually goes wrong: no wire crosses a box, every
segment is orthogonal, every connected pin is reached by a wire, boxes don't
overlap, nothing leaves the canvas, and the same circuit always lays out
identically. Both of the defects described above were caught that way.

`layoutCircuit` also returns `warnings` — a net naming a pin its component
never declared, a component nothing connects to, a net with one end. Structured
output guarantees the response *parses*; it cannot guarantee the circuit is
coherent, and those get shown to the user rather than silently dropped.

What this is not: symbol glyphs, crossing minimisation, or anything resembling
schematic-quality routing. Components are labelled boxes. That is a deliberate
v1 boundary, not an oversight.

---

## Monetization

Native in-app purchases through **RevenueCat**, which wraps Apple IAP and Google
Play Billing. The app never asserts its own entitlements — RevenueCat POSTs to
`/api/webhook/revenuecat` and the server credits the account. Fulfilment is
server-side because a client that can grant itself credits will.

RevenueCat rather than `expo-in-app-purchases` (discontinued — last npm release
about three years ago, and removed from Expo's own docs) or `react-native-iap`
direct, which would mean writing receipt validation against both Apple and
Google from scratch.

The ledger in `backend/billing.py` follows Scribe's chunk billing: a lifetime
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

### The purchase flow

1. `useRevenueCat` configures the SDK and **binds the RevenueCat customer to the
   signed-in account** with `Purchases.logIn(user_id)`. This is the load-bearing
   step: left anonymous, RevenueCat generates a `$RCAnonymousID:…` that matches
   no user, the webhook's unknown-user branch fires, and the buyer is charged
   and never credited.
2. The buyer taps a pack; `Purchases.purchasePackage()` opens the native sheet.
3. RevenueCat POSTs `/api/webhook/revenuecat`, which credits MongoDB.
4. The app polls `/billing/entitlements` until the balance moves.

Step 4 is why the sheet says "Confirming your purchase…" rather than closing
immediately. Fulfilment is asynchronous, and by that point the money has already
moved — so a slow webhook is reported as *"your credits are on the way"*, never
as a failure. Timing out shows the same message with a nudge toward Restore.

Prices come from the store, never from the app. The store is the only thing that
knows what a pack costs in the buyer's currency after local tax; a hardcoded
`$4.99` is wrong for most of the world and eventually wrong everywhere.

### Setting up the products

The product ids below must match **exactly** across three places: the store
console, `CONSUMABLE_GRANTS`/`SUBSCRIPTION_GRANTS` in
`backend/revenuecat_webhook.py`, and `frontend/src/billing/products.ts`.

| Product id | Type | Grants |
|---|---|---|
| `credits_10` | Consumable | 10 credits |
| `credits_25` | Consumable | 25 credits |
| `credits_60` | Consumable | 60 credits |
| `trace_unlimited_monthly` | Subscription | Unlimited, monthly |
| `trace_unlimited_annual` | Subscription | Unlimited, annual |

1. Create them in **Play Console** (Monetise → Products) and **App Store
   Connect** (In-App Purchases), using these exact ids on both.
2. Add them to a RevenueCat offering. The client reads packages from *every*
   offering, not just the current one, so grouping is up to you.
3. Set `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY` and `EXPO_PUBLIC_REVENUECAT_APPLE_KEY`
   to the **public** SDK keys, and `REVENUECAT_API_KEY` on the backend to the
   **secret** key. The secret key must never ship in the app.
4. Point a RevenueCat webhook at `POST /api/webhook/revenuecat`. If you set
   `REVENUECAT_WEBHOOK_AUTH`, send it as the `Authorization` header.

Google Play reports a subscription as `productId:basePlanId`, so
`trace_unlimited_monthly` arrives as `trace_unlimited_monthly:monthly`. Both
sides strip the suffix — `base_product_id` on the server, `baseIdentifier` on the
client. A product that ever needs renaming needs renaming in both.

---

## Store compliance

Three things both stores require of an app that creates accounts and sells
things, all of them wired up:

**Account deletion.** `About → Delete my account` opens a dialog that names what
goes, requires the word DELETE to be typed, and warns — separately and in amber —
that deleting the account does *not* cancel a subscription. That warning is the
one that costs people money: someone who assumes otherwise keeps being billed
for an account that no longer exists.

Server-side, `DELETE /api/auth/account` purges every collection in
`USER_COLLECTIONS` plus purchase records and sessions, and removes the user row
**last** — if a purge fails partway the caller still holds a valid session and
can retry, whereas deleting identity first would strand the rest with no
authenticated way to reach it. Four tests cover it, including that the purge is
scoped to the caller and that identity really is removed last.

**A deletion route reachable without the app**, which Play requires. `docs/`
holds the page; the backend serves a copy at `GET /account-deletion`.

**A privacy policy.** `docs/index.html`. It describes the app's actual
behaviour, including the part worth stating plainly: photographs sent for
diagnosis are never stored. They are transmitted for one request and discarded,
so a saved diagnosis holds the model's written description of the board, not the
image.

### Before submitting

1. Publish `docs/` — see `docs/README.md`. This repo is private, so the
   arrangement is a small public repo (`trace-privacy`) served by GitHub Pages.
2. Fill in every `TODO` in `docs/index.html` and `docs/data-deletion.html`: the
   support address and the effective date.
3. Put the published URLs into `frontend/src/links.ts`, the backend's
   `PRIVACY_POLICY_URL`, and both store listings — all four must agree.
4. Set `SUPPORT_EMAIL` on the backend to the same address.
5. Replace the placeholder brand assets (`frontend/scripts/brand-assets.py`).

The policy is written to match the code. If you change what the app stores,
change it there too — a policy describing behaviour the app does not have is
worse than no policy.

---

## Native builds

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
npm run typecheck
npm run lint
npm test                      # 51 tests
npm run diagram:check         # circuit layout invariants
npx expo start
```

`jest-expo` is pinned to an exact `57.0.4`: `57.0.5` peer-requires
`@react-native/jest-preset@^0.86.3`, while react-native 0.86.2 — the version
Expo SDK 57 pins — requires exactly `0.86.2`. Bumping React Native to satisfy a
test dependency is the tail wagging the dog.

The public env vars are set in `jest.global-setup.js` rather than a test file,
because `babel-preset-expo` inlines `process.env.EXPO_PUBLIC_*` at transform
time. Setting them any later bakes in `""` — which silently made the paywall's
"store unavailable" test pass on a missing API key rather than on the empty
offerings it was meant to check.

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
| `POST` | `/billing/restore` | Reconcile entitlements against the store |
| `POST` | `/webhook/revenuecat` | RevenueCat webhook — fulfils purchases (no auth header) |

Plus two unprefixed public routes: `GET /health`, and `GET /account-deletion` —
a deletion page reachable without installing the app.

---

## What's not built yet

- **Store products.** The code is done; the products themselves still need
  creating in App Store Connect and Play Console — see
  [Setting up the products](#setting-up-the-products). Until they exist the
  paywall opens and says no purchase options are configured.
- **Publishing `docs/`.** The privacy policy and deletion pages are written but
  not hosted, and both carry `TODO` markers for the support address and
  effective date. See [Store compliance](#store-compliance).
- **Component reference** — deferred to v1.1, per the MVP scope. The screen
  exists so navigation is complete.
- **Brand assets.** `frontend/assets/images/` holds generated placeholders.
  Replace before either store submission; `scripts/brand-assets.py` regenerates
  them.
- **iOS.** The bundle identifier and Info.plist strings are set, but shipping
  needs an Apple Developer account and a RevenueCat Apple key.

---

## Violet Seed Labs

Trace is a Violet Seed Labs app. *Built to grow.*

| | |
|---|---|
| Bundle ID / package | `com.violetseedlabs.trace` |
| Palette | `#4C1D95` → `#8B5CF6` gradient, `#C4B5FD` accent, `#1A1428` ground, `#FAF9FB` type |

Dark is the only theme. `src/theme.ts` carries the tokens under the same names
Scribe uses, so a component moves between the two apps without a rename.
