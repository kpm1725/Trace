/**
 * RevenueCat product identifiers, mirroring the grant tables in
 * `backend/revenuecat_webhook.py`.
 *
 * The backend credits a purchase by exact `product_id`, so these lists are the
 * same contract seen from the client: a product missing here can never be
 * bought, and a product missing there can never be credited. The two sides must
 * stay in step.
 *
 * PENDING: these ids follow from the billing unit, which is not settled — see
 * the docstring at the top of `backend/billing.py`. If usage ends up metered
 * separately per feature rather than from one shared credit balance, this file
 * and the backend grant tables change together.
 */
import { PurchasesPackage } from "react-native-purchases";

/** Consumable credit packs. One credit currently buys one AI call, either kind. */
export const CREDIT_PRODUCT_IDS = ["credits_10", "credits_25", "credits_60"] as const;

/** Trace Unlimited — one subscription lifting the credit gate entirely. */
export const UNLIMITED_PRODUCT_IDS = [
  "trace_unlimited_monthly",
  "trace_unlimited_annual",
] as const;

/**
 * Google Play reports a subscription's identifier as `productId:basePlanId`,
 * so compare against the part before the colon. `base_product_id` in
 * `revenuecat_webhook.py` normalises the same way — a mismatch here is how
 * Scribe's first unlimited subscription was charged and never credited.
 */
function baseIdentifier(identifier: string): string {
  return identifier.split(":")[0];
}

/** True when a package is one of `ids`, by either package or product identifier. */
export function matchesProduct(pack: PurchasesPackage, ids: readonly string[]): boolean {
  return (
    ids.includes(baseIdentifier(pack.product.identifier)) ||
    ids.includes(baseIdentifier(pack.identifier))
  );
}

/**
 * Everything the paywall offers: the credit packs plus Trace Unlimited.
 *
 * Scribe learned to build this in one place: paywalls that assembled their own
 * lists inline are how a subscription could be added to the catalogue and
 * appear on none of them.
 */
export function paywallProductIds(): readonly string[] {
  return [...CREDIT_PRODUCT_IDS, ...UNLIMITED_PRODUCT_IDS];
}

/** True for the subscription rather than a consumable pack. */
export function isUnlimitedProduct(pack: PurchasesPackage): boolean {
  return matchesProduct(pack, UNLIMITED_PRODUCT_IDS);
}
