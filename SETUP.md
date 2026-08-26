# Setting up Trace

From an empty machine to an app installed on your phone.

**The useful thing to know first:** you do not need any store setup to get a
fully working build. Every account starts with 5 free credits, and if RevenueCat
isn't configured the paywall opens and says purchases aren't available in this
build. So Part 1 gets you a real, usable app; Parts 2 and 3 are for taking money
and for shipping.

**Expo Go will not run Trace.** `expo-image-picker`, `react-native-svg` and
`react-native-purchases` are native modules. You need a real build.

---

## Part 1 — A working app on your phone

Roughly an afternoon, most of it waiting. Do these in order; step 5 depends on
something step 6 produces, which is the one genuinely awkward bit.

### 1. MongoDB Atlas

Create a free M0 cluster. Add a database user, and under Network Access allow
`0.0.0.0/0` (Railway's egress IPs aren't fixed on the plans you'll be using).

Copy the connection string. It looks like:

```
mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

If your password contains `@`, `:`, `/` or `#`, URL-encode it or the driver will
misparse the URI.

### 2. Anthropic API key

From [console.anthropic.com](https://console.anthropic.com) → API Keys. Trace
uses `claude-sonnet-5` for both calls. A debug session is one vision call over
one image; a circuit generation is a longer completion — budget accordingly, and
note that the free tier's rate limits are low enough to be noticeable while
testing.

### 3. Deploy the backend to Railway

New Project → Deploy from GitHub repo → pick this repo. Set **Root Directory**
to `backend`; `nixpacks.toml` handles the rest.

Set these variables:

| Variable | Value |
|---|---|
| `MONGO_URL` | the Atlas connection string |
| `DB_NAME` | `trace_database` |
| `ANTHROPIC_API_KEY` | your key |
| `GOOGLE_CLIENT_IDS` | leave empty for now — step 5 fills it |

Generate a domain (Settings → Networking → Generate Domain) and check it:

```bash
curl https://YOUR-APP.up.railway.app/health
# {"ok":true,"service":"trace","company":"Violet Seed Labs"}
```

The logs will show `GOOGLE_CLIENT_IDS is empty; every Google sign-in will fail.`
That is expected until step 5.

### 4. Create the EAS project

```bash
npm i -g eas-cli
eas login
cd frontend
eas init
```

`eas init` writes `extra.eas.projectId` into `app.json` — Trace has no project
id committed, because it's specific to your Expo account. **Commit that change.**

Then put your Railway URL into `eas.json`, replacing
`https://your-api.up.railway.app` in all three build profiles. `EXPO_PUBLIC_*`
values are inlined at build time, so a build carries whatever was in `eas.json`
when it ran.

### 5. Google OAuth — read this bit before starting it

There's a chicken-and-egg here that catches people out: the **Android OAuth
client needs the SHA-1 fingerprint of your app signing key**, and that key
doesn't exist until EAS generates it.

So, in this order:

```bash
cd frontend
eas credentials          # Android → Keystore → set up a new keystore
```

Let EAS generate one, then read back its **SHA-1 fingerprint** from the same
menu. (Alternatively run a build first — it generates a keystore on the way
past — then come back for the fingerprint.)

Now in [Google Cloud Console](https://console.cloud.google.com) → APIs &
Services → Credentials, create **two** OAuth 2.0 Client IDs:

- **Web application.** No redirect URIs needed for this flow. Copy the client ID.
- **Android.** Package name `com.violetseedlabs.trace`, SHA-1 = the fingerprint
  from EAS. Copy the client ID.

Then:

```bash
cp .env.example .env
```

and fill in:

```
EXPO_PUBLIC_BACKEND_URL=https://YOUR-APP.up.railway.app
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...apps.googleusercontent.com
```

**And set `GOOGLE_CLIENT_IDS` on Railway to both of them, comma-separated:**

```
GOOGLE_CLIENT_IDS=WEB_ID.apps.googleusercontent.com,ANDROID_ID.apps.googleusercontent.com
```

The server checks the `aud` claim of the ID token against that list and rejects
anything not on it. Which client the token comes from depends on the platform
and the flow, so listing both removes a whole category of confusing 401s. Add
the iOS client id here too when you get to iOS — it's a Railway variable change,
not a redeploy.

You also need a **consent screen**. External, and while it's in Testing mode
only accounts you add under Test Users can sign in — add your own.

### 6. Build and install

```bash
cd frontend
eas build --profile preview --platform android
```

That's the profile you want: it produces an **APK**, which you can download from
the EAS build page on your phone and sideload directly. (`--profile production`
builds an AAB, which is for Play upload and cannot be sideloaded.)

The first build takes 10–20 minutes. When it's done, open the build link on the
phone, download, and allow installation from that source.

### 7. Check it works

In rough order of what breaks first:

1. **App opens** to the Trace splash, then the login screen.
2. **Sign in with Google** — the account must be a Test User if your consent
   screen is unverified.
3. **The credit pill** on the home screen reads `5 credits`. If it's missing,
   the app can't reach the backend.
4. **Generate from prompt** — try `555 timer astable LED blinker, 9V supply`.
   This exercises Claude, the netlist schema, and the diagram renderer in one
   go. It costs 2 credits.
5. **Debug from photo** — photograph any breadboard and describe a symptom.
   Costs 1 credit.
6. **History** — both should be listed, and reopening one should render the
   same result.

Steps 4 and 5 are the first time the prompts in `backend/ai.py` have ever been
run against the real API. Judge the output quality then, not before.

---

## Part 2 — Purchases

Only needed once you want to take money. The five product ids below must match
**exactly** in three places: the store console, `CONSUMABLE_GRANTS` /
`SUBSCRIPTION_GRANTS` in `backend/revenuecat_webhook.py`, and
`frontend/src/billing/products.ts`. A mismatch means a purchase that charges and
never credits.

| Product id | Type | Grants |
|---|---|---|
| `credits_10` | Consumable | 10 credits |
| `credits_25` | Consumable | 25 credits |
| `credits_60` | Consumable | 60 credits |
| `trace_unlimited_monthly` | Subscription | Unlimited, monthly |
| `trace_unlimited_annual` | Subscription | Unlimited, annual |

1. Create them in **Play Console** → Monetise → Products (and App Store Connect
   → In-App Purchases, for iOS).
2. In **RevenueCat**, create a project, add the app, and add these products to
   an offering. The client reads packages from *every* offering, not just the
   current one, so how you group them is up to you.
3. Set the keys:
   - `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY` and
     `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` in `frontend/.env` — the **public** SDK
     keys, which ship inside the app.
   - `REVENUECAT_API_KEY` on Railway — the **secret** key. This one must never
     reach the app.
4. Point a RevenueCat webhook at `https://YOUR-APP.up.railway.app/api/webhook/revenuecat`.
   If you set `REVENUECAT_WEBHOOK_AUTH` on Railway, send the same value as the
   webhook's `Authorization` header.
5. Rebuild — the public keys are inlined at build time.

Testing purchases needs a **licence tester** account on Play (Play Console →
Settings → Licence testing) or a **sandbox tester** on App Store Connect. Real
money is not charged for either.

### How a purchase actually completes

1. The app calls `Purchases.logIn(user_id)` — binding the RevenueCat customer to
   the Trace account. Everything else depends on this.
2. The native sheet takes payment.
3. RevenueCat POSTs the webhook; the server credits MongoDB.
4. The app polls `/billing/entitlements` until the balance moves.

Step 4 is why the sheet says "Confirming your purchase…" rather than closing at
once. If the webhook is slow the app says the credits are on the way and points
at Restore — it never calls a completed payment a failure, because by then the
money has moved.

---

## Part 3 — Before submitting to a store

1. **Publish `docs/`.** The privacy policy and account-deletion pages. This repo
   is private and GitHub Pages needs a paid plan for private repos, so publish
   them from a small public repo — see `docs/README.md`.
2. **Fill in every `TODO`** in `docs/index.html` and `docs/data-deletion.html`:
   the support address and the effective date.
3. **Line up the URLs.** `frontend/src/links.ts`, the backend's
   `PRIVACY_POLICY_URL`, and both store listings must all point at the published
   pages. Set `SUPPORT_EMAIL` on Railway to the same address.
4. **Replace the placeholder brand assets.** `frontend/assets/images/` currently
   holds generated placeholders; `frontend/scripts/brand-assets.py` regenerates
   them if you want to iterate on the mark before commissioning real art.
5. **Read the privacy policy against the code.** It was written to describe what
   the app actually does — including that photographs are never stored. If you
   change what Trace keeps, change the policy in the same commit. A policy
   describing behaviour the app doesn't have is worse than no policy.
6. **iOS additionally needs** an Apple Developer account, an App Store Connect
   app record, and a RevenueCat Apple key.

---

## Local development

```bash
# Backend
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env               # fill in your values
.venv/bin/python -m pytest         # 44 tests, no services needed
.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend
cd frontend
npm install
cp .env.example .env
npm run typecheck
npm run lint
npm test                           # 51 tests
npm run diagram:check              # circuit layout invariants
npm run diagram:check -- --svg     # writes previews to .diagram/
```

Both test suites run with no database, no network and no API key.

To iterate on the app itself without a full rebuild each time, build the dev
client once and run Metro against it:

```bash
eas build --profile development --platform android
npx expo start --dev-client
```

Only a native change — a new native dependency, or anything in `app.json`'s
plugins or permissions — needs a fresh build. JavaScript changes reload over
Metro.

---

## When it doesn't work

**`Token audience mismatch` (401 on sign-in)**
The `aud` of the Google ID token isn't in `GOOGLE_CLIENT_IDS`. List both the web
and Android client ids on Railway, comma-separated, no spaces.

**Sign-in opens Google, returns, and nothing happens**
The app will now say *"Google didn't return an ID token"* — that means the OAuth
client type is wrong. Check the Android client's package name is exactly
`com.violetseedlabs.trace` and its SHA-1 matches the keystore EAS is signing
with (`eas credentials`).

**`Error 10` / `DEVELOPER_ERROR` from Google on Android**
Always the SHA-1. A debug build signed with a different key won't match the
Android OAuth client. Re-read the fingerprint from `eas credentials` and confirm
it's the one in Google Cloud Console.

**Sign-in works but every API call 401s**
The session token isn't reaching the server. Check `EXPO_PUBLIC_BACKEND_URL` has
no trailing slash and that the build was made *after* you set it — those values
are baked in at build time, not read at runtime.

**Credit pill missing, everything else fine**
`/billing/entitlements` is failing. The balance is deliberately non-blocking, so
the app keeps working; check the Railway logs.

**`No purchase options are set up yet`**
RevenueCat is reachable but no product matched. Either the offering is empty or
the ids don't match `frontend/src/billing/products.ts`.

**`In-app purchases aren't set up in this build`**
The RevenueCat public key was empty at build time. Expected until Part 2.

**A purchase charged but the balance didn't move**
Check the Railway logs for the webhook. `Not credited: product_id=…` means the
id isn't in the backend grant tables. `RevenueCat purchase for unknown user`
means `Purchases.logIn` didn't run before the purchase — the buyer was
anonymous. Either way the delivery is stored unfulfilled rather than discarded,
so Restore or `POST /api/billing/restore` can recover it once the cause is
fixed.

**Build fails on Gradle**
Check `android/` and `ios/` aren't committed. They're in `.gitignore` and
`.easignore` so EAS runs a fresh `expo prebuild` and the Gradle wrapper always
matches the SDK; a stale local copy ships its own wrapper and breaks the build.

---

Trace is a Violet Seed Labs app. *Built to grow.*
