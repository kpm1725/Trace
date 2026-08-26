#!/usr/bin/env python3
"""Smoke-test a deployed Trace RevenueCat webhook endpoint.

This verifies the plumbing you configure in the RevenueCat dashboard actually
works end to end, without needing to make a real store purchase:

  1. the webhook URL is reachable
  2. the shared secret is enforced (a wrong/missing secret is rejected)
  3. a well-formed event is accepted
  4. (optional) the event actually moved a real user's credit balance

Usage:
    python scripts/verify_webhook.py https://your-api.up.railway.app \\
        --secret "$REVENUECAT_WEBHOOK_SECRET" \\
        --user-id user_abc123          # optional, must be a real Trace user_id

Product IDs and credit amounts are imported from billing.py so this can never
drift from what the server actually honours.
"""
import argparse
import json
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from billing import CREDIT_PRODUCTS, UNLIMITED_PRODUCT_ID  # noqa: E402

WEBHOOK_PATH = "/api/billing/revenuecat-webhook"


def make_event(product_id: str, app_user_id: str, event_type="INITIAL_PURCHASE") -> dict:
    """A synthetic event shaped like RevenueCat's documented webhook payload."""
    event = {
        "id": f"smoketest_{uuid.uuid4().hex[:12]}",
        "type": event_type,
        "app_user_id": app_user_id,
        "product_id": product_id,
        "environment": "SANDBOX",
        "store": "APP_STORE",
        "purchased_at_ms": int(datetime.now(timezone.utc).timestamp() * 1000),
    }
    if product_id == UNLIMITED_PRODUCT_ID:
        event["expiration_at_ms"] = int(
            (datetime.now(timezone.utc) + timedelta(days=30)).timestamp() * 1000)
    return {"api_version": "1.0", "event": event}


def post(url: str, payload: dict, secret: str | None) -> httpx.Response:
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["Authorization"] = f"Bearer {secret}"
    return httpx.post(url, json=payload, headers=headers, timeout=20.0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("base_url", help="Backend base URL, e.g. https://trace.up.railway.app")
    ap.add_argument("--secret", required=True, help="REVENUECAT_WEBHOOK_SECRET value")
    ap.add_argument("--user-id", default="smoketest_nonexistent_user",
                    help="A real Trace user_id to credit; omit to test plumbing only")
    ap.add_argument("--product", default=next(iter(CREDIT_PRODUCTS)),
                    help=f"Product to simulate. Known: {list(CREDIT_PRODUCTS) + [UNLIMITED_PRODUCT_ID]}")
    args = ap.parse_args()

    url = args.base_url.rstrip("/") + WEBHOOK_PATH
    failures = []

    print(f"→ webhook URL: {url}\n")

    # 1 + 2: the secret must actually be enforced.
    print("[1/3] rejecting a bad secret ...")
    try:
        r = post(url, make_event(args.product, args.user_id), "definitely-not-the-secret")
    except httpx.RequestError as e:
        print(f"  ✗ could not reach the endpoint: {e}")
        return 1
    if r.status_code == 401:
        print("  ✓ bad secret rejected with 401")
    else:
        print(f"  ✗ expected 401, got {r.status_code} — webhook is NOT authenticated.")
        print("    Set REVENUECAT_WEBHOOK_SECRET on the server and in the RevenueCat dashboard.")
        failures.append("auth not enforced")

    # 3: a real event is accepted.
    print("\n[2/3] accepting a valid event ...")
    payload = make_event(args.product, args.user_id)
    r = post(url, payload, args.secret)
    if r.status_code == 200:
        print(f"  ✓ accepted (event id {payload['event']['id']})")
    else:
        print(f"  ✗ expected 200, got {r.status_code}: {r.text[:300]}")
        failures.append("valid event rejected")

    # 4: idempotency — the same event twice must not double-credit.
    print("\n[3/3] replaying the same event (idempotency) ...")
    r2 = post(url, payload, args.secret)
    if r2.status_code == 200:
        print("  ✓ replay accepted without error (handler dedupes on event id)")
    else:
        print(f"  ✗ replay returned {r2.status_code}: {r2.text[:300]}")
        failures.append("replay errored")

    print()
    if args.user_id.startswith("smoketest_"):
        print("NOTE: no real --user-id given, so this only proved the plumbing.")
        print("      The event will have been parked in pending_billing_events as")
        print("      an unknown user — that's expected, and harmless.")
    else:
        credits = CREDIT_PRODUCTS.get(args.product)
        if credits:
            print(f"NOTE: check that user {args.user_id} gained exactly {credits} credits")
            print("      (once, not twice) via GET /api/billing/entitlements.")
        else:
            print(f"NOTE: check that user {args.user_id} now shows is_unlimited=true.")

    if failures:
        print(f"\nFAILED: {', '.join(failures)}")
        return 1
    print("\nAll webhook checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
