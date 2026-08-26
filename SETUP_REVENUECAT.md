# RevenueCat setup for Trace

Everything here has to happen in dashboards that need your credentials and a paid
developer account, so it can't be scripted from the repo. What *is* automated: a
smoke test (`backend/scripts/verify_webhook.py`) that proves the webhook half is
correctly wired once you've done steps 1–5.

The product IDs below are the ones the server actually honours — they're defined in
[`backend/billing.py`](backend/billing.py) (`CREDIT_PRODUCTS`, `UNLIMITED_PRODUCT_ID`).
**If you use different IDs in the stores, change them in `billing.py` too or purchases
will be accepted and credit nothing** (they'll land as `unmapped_product`).

| Product ID | Type | Suggested price | Grants |
|---|---|---|---|
| `trace_credits_10` | Consumable | $2.99 | 10 credits |
| `trace_credits_40` | Consumable | $8.99 | 40 credits |
| `trace_unlimited_monthly` | Auto-renewing subscription | $9.99 / month | Unmetered debug + generate |

Free tier is 5 credits per account, lifetime — server-side only, nothing to configure
in any store.

---

## 1. App Store Connect (iOS)

1. Create the app with bundle ID `com.violetseedlabs.trace`.
2. **In-App Purchases** → create two **Consumable** products with the exact IDs
   `trace_credits_10` and `trace_credits_40`.
3. **Subscriptions** → create a subscription group (e.g. "Trace Unlimited") and one
   auto-renewing subscription with product ID `trace_unlimited_monthly`, duration 1 month.
4. Fill in a display name, description, and price tier for each, and attach the
   review screenshot Apple requires — products stay in "Missing Metadata" until you do,
   and RevenueCat can't see them in that state.
5. **App-Specific Shared Secret** (App Information → App-Specific Shared Secret) —
   copy it; RevenueCat needs it in step 3.

## 2. Google Play Console (Android)

1. Create the app with package name `com.violetseedlabs.trace`.
2. **Monetize → In-app products** → create `trace_credits_10` and `trace_credits_40`.
3. **Monetize → Subscriptions** → create `trace_unlimited_monthly` with a monthly
   base plan.
4. Activate all three (a product left inactive won't appear in offerings).
5. Create a **service account** with the *Google Play Developer API* enabled, grant it
   Financial data / order management access in Play Console, and download its JSON key —
   RevenueCat needs this to verify Android purchases.

> Play requires an app to be uploaded to a track (internal testing is enough) before
> in-app products can be created. Do the first EAS build before this step.

## 3. RevenueCat — project and apps

1. Create a project (e.g. "Trace").
2. **Apps → add an App Store app**: bundle ID `com.violetseedlabs.trace`, paste the
   App-Specific Shared Secret from step 1.5.
3. **Apps → add a Play Store app**: package `com.violetseedlabs.trace`, upload the
   service-account JSON from step 2.5.

## 4. RevenueCat — products, entitlement, offering

1. **Products** → import/create all three product IDs for both platforms. You should end
   up with 6 product rows (3 iOS + 3 Android) sharing the 3 identifiers.
2. **Entitlements** → create one entitlement with identifier **`unlimited`** and attach
   *only* `trace_unlimited_monthly` (both platforms) to it.
   - This name must match `REVENUECAT_UNLIMITED_ENTITLEMENT_ID` in `backend/.env`
     (defaults to `unlimited`). The credit packs deliberately get **no** entitlement —
     they're consumables tracked by our own ledger, not by RevenueCat entitlements.
3. **Offerings** → create an offering, mark it **Current**, and add three packages:
   - one for `trace_credits_10`
   - one for `trace_credits_40`
   - one for `trace_unlimited_monthly` (the `$rc_monthly` package identifier is the
     idiomatic choice here)

   The app renders whatever packages the current offering contains — `Paywall.tsx`
   iterates `offering.availablePackages` and shows each product's own localized title
   and `priceString`, so ordering in the dashboard is the ordering users see.

## 5. RevenueCat — API keys and webhook

1. **API Keys** → copy the **public** SDK keys into `frontend/.env`:
   ```
   EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_xxxxx
   EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_xxxxx
   ```
2. Copy the **secret** API key into `backend/.env` as `REVENUECAT_SECRET_API_KEY`.
   This one must never ship in the app — it's only used server-side by
   `/api/billing/sync` to read subscription status.
3. **Integrations → Webhooks** → add a webhook:
   - **URL**: `https://<your-railway-host>/api/billing/revenuecat-webhook`
   - **Authorization header**: any strong random string — generate one with
     `openssl rand -hex 32`
4. Put that same string in `backend/.env` as `REVENUECAT_WEBHOOK_SECRET` and redeploy.

> If `REVENUECAT_WEBHOOK_SECRET` is left empty the endpoint accepts unauthenticated
> POSTs — meaning anyone who finds the URL can grant themselves credits. Always set it
> in production. `verify_webhook.py` fails loudly if it isn't enforced.

## 6. Verify the webhook

```bash
cd backend
python scripts/verify_webhook.py https://<your-railway-host> \
    --secret "$REVENUECAT_WEBHOOK_SECRET" \
    --user-id <a real user_id from your users collection>
```

It checks that a bad secret is rejected with 401, that a well-formed event is accepted,
and that replaying the same event doesn't error. Then confirm via
`GET /api/billing/entitlements` (as that user) that they gained exactly 10 credits —
**once, not twice**.

Omit `--user-id` to test only the plumbing; the event is then parked as an unknown user,
which is expected and harmless.

## 7. Test a real purchase

1. Build a dev client — real purchases don't work in Expo Go, since
   `react-native-purchases` is native code:
   ```bash
   cd frontend
   eas build --profile development --platform android
   ```
2. iOS: create a **Sandbox Apple Account** in App Store Connect → Users and Access, and
   sign into it on the device under Settings → Developer.
   Android: add your Google account to **License testing** in Play Console, and install
   the app from an internal-testing track.
3. Burn all 5 free credits, confirm the paywall appears, buy a credit pack, and confirm
   the balance updates.
4. Reinstall the app and use **Restore purchases** to confirm the unlimited pass
   comes back.

---

## How purchases actually reach the ledger

```
purchase → RevenueCat verifies the store receipt
         → webhook POST /api/billing/revenuecat-webhook
         → billing.handle_revenuecat_event()   ← credits the user
app also calls POST /api/billing/sync after purchase (covers webhook latency,
and replays anything parked)
```

Two failure modes are handled explicitly, both covered by tests in
`backend/tests/test_billing.py`:

- **Duplicate delivery.** RevenueCat retries. The handler claims each event with an
  atomic insert against a unique index on `event_id`, so a replay can't double-credit.
- **Event for an unknown `app_user_id`.** Rather than being dropped (which would
  silently destroy a purchase someone paid for), it's parked in
  `pending_billing_events` and replayed by `/api/billing/sync` once that user exists.

If a purchase ever appears to go missing, check `pending_billing_events` first — a row
there means we received the money event but couldn't match it to an account.
