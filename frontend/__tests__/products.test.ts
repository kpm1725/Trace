/**
 * Product id matching.
 *
 * Google Play reports a subscription as `productId:basePlanId`. A mismatch here
 * means a purchase that charges and never credits, which is the single most
 * expensive bug this app can have.
 */
import {
  CREDIT_PRODUCT_IDS,
  isUnlimitedProduct,
  matchesProduct,
  paywallProductIds,
  UNLIMITED_PRODUCT_IDS,
} from "@/src/billing/products";

const pack = (productId: string, packageId = "$rc_custom") =>
  ({ identifier: packageId, product: { identifier: productId } }) as any;

it("matches a bare product id", () => {
  expect(matchesProduct(pack("credits_25"), CREDIT_PRODUCT_IDS)).toBe(true);
});

it("matches through Play's :basePlanId suffix", () => {
  expect(matchesProduct(pack("trace_unlimited_monthly:monthly"), UNLIMITED_PRODUCT_IDS)).toBe(true);
  expect(matchesProduct(pack("trace_unlimited_annual:p1y"), UNLIMITED_PRODUCT_IDS)).toBe(true);
});

it("matches on the package identifier too", () => {
  expect(matchesProduct(pack("something_else", "credits_10"), CREDIT_PRODUCT_IDS)).toBe(true);
});

it("does not match another app's products", () => {
  expect(matchesProduct(pack("some_other_app_sku"), CREDIT_PRODUCT_IDS)).toBe(false);
  expect(matchesProduct(pack("credits_25"), UNLIMITED_PRODUCT_IDS)).toBe(false);
});

it("separates the subscription from the credit packs", () => {
  expect(isUnlimitedProduct(pack("trace_unlimited_monthly:monthly"))).toBe(true);
  expect(isUnlimitedProduct(pack("credits_60"))).toBe(false);
});

it("offers every product on the one paywall", () => {
  const ids = paywallProductIds();
  for (const id of [...CREDIT_PRODUCT_IDS, ...UNLIMITED_PRODUCT_IDS]) {
    expect(ids).toContain(id);
  }
});

it("keeps the client list in step with the backend grant tables", () => {
  // These are the keys of CONSUMABLE_GRANTS and SUBSCRIPTION_GRANTS in
  // backend/revenuecat_webhook.py. A product missing from either side can never
  // be bought or never be credited.
  expect([...CREDIT_PRODUCT_IDS]).toEqual(["credits_10", "credits_25", "credits_60"]);
  expect([...UNLIMITED_PRODUCT_IDS]).toEqual([
    "trace_unlimited_monthly",
    "trace_unlimited_annual",
  ]);
});
