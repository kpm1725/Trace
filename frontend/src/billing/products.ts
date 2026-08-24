/**
 * RevenueCat product identifiers, mirroring the grant tables in
 * `backend/revenuecat_webhook.py`.
 *
 * The backend credits a purchase by exact `product_id`, so these lists are the
 * same contract seen from the client: a product missing here can never be
 * bought, and a product missing there can never be credited. The two sides must
 * stay in step.
 */
import { PurchasesPackage } from "react-native-purchases";

/**
 * Consumable credit packs.
 *
 * One pool covers both tools, priced by weight — a diagnosis costs 1 credit and
 * a circuit generation costs 2 (`CREDIT_COST` in `backend/billing.py`). Pack
 * sizes are deliberately not multiples of either: the paywall quotes credits,
 * not calls, so a pack is never "three and a bit generations".
 */
export const CREDIT_PRODUCT_IDS = ["credits_10", "credits_25", "credits_60"] as const;

/** Trace Unlimited — one subscription lifting the credit gate entirely. */
export const UNLIMITED_PRODUCT_IDS = [
  "trace_unlimited_monthly",
  "trace_unlimited_annual",
] as const;

/**
 * Google Play reports a subscription's identifier as `productId:basePlanId`,
 * so compare against the part before the colon. `base_product_id` in
 * `revenuecat_webhook.py` normalises the same way; a mismatch between the two
 * means a subscription that is charged and never credited.
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
 * Built in one place. A paywall that assembles its own list inline is how a
 * product gets added to the catalogue and shows up on no screen.
 */
export function paywallProductIds(): readonly string[] {
  return [...CREDIT_PRODUCT_IDS, ...UNLIMITED_PRODUCT_IDS];
}

/** True for the subscription rather than a consumable pack. */
export function isUnlimitedProduct(pack: PurchasesPackage): boolean {
  return matchesProduct(pack, UNLIMITED_PRODUCT_IDS);
}
