/**
 * RevenueCat identity and offerings.
 *
 * This lives in its own file on purpose. `use-revenuecat` caches `configured`
 * and `identifiedUserId` at module scope, because RevenueCat's SDK state is
 * process-global and re-configuring or re-identifying per component would be
 * wrong. Jest gives each test *file* a fresh module registry, so this is the
 * only place `logIn` can be observed being called for the first time.
 */
import { render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import Purchases from "react-native-purchases";

import {
  isUserCancelled,
  useRevenueCat,
  type RevenueCatState,
} from "@/src/hooks/use-revenuecat";

jest.mock("@/src/context/AuthContext", () => ({
  useAuth: () => ({ user: { user_id: "user_42", email: "a@b.c", name: "A" } }),
}));

const mockPurchases = Purchases as jest.Mocked<typeof Purchases>;

/** A component that does nothing but drive the hook. */
function Harness({ onState }: { onState: (s: RevenueCatState) => void }) {
  const state = useRevenueCat();
  onState(state);
  return <Text>{state.isReady ? "ready" : "loading"}</Text>;
}

const pack = (productId: string) =>
  ({
    identifier: `$rc_${productId}`,
    product: { identifier: productId, title: productId, description: "", priceString: "£1" },
  }) as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockPurchases.getCustomerInfo.mockResolvedValue({} as any);
  mockPurchases.logIn.mockResolvedValue({} as any);
  mockPurchases.getOfferings.mockResolvedValue({ all: {} } as any);
});

/**
 * Must run first, and asserts both properties together.
 *
 * `configured` and `identifiedUserId` are process-global by design, so
 * "configured exactly once" and "identified exactly once" are only observable
 * on the very first mount in the process. Any later test in this file finds the
 * work already done — correctly — and would see zero calls.
 */
it("sets up the SDK once per process and binds it to the account", async () => {
  render(<Harness onState={() => {}} />);
  await waitFor(() => expect(mockPurchases.configure).toHaveBeenCalled());

  // The single most important call in the purchase flow. Left anonymous,
  // RevenueCat mints a `$RCAnonymousID:…` that matches no user, the webhook's
  // unknown-user branch fires, and the buyer is charged and never credited.
  await waitFor(() => expect(mockPurchases.logIn).toHaveBeenCalledWith("user_42"));

  // A second mount re-reads offerings but must not re-configure or re-identify.
  render(<Harness onState={() => {}} />);
  await waitFor(() => expect(mockPurchases.getOfferings).toHaveBeenCalledTimes(2));
  expect(mockPurchases.configure).toHaveBeenCalledTimes(1);
  expect(mockPurchases.logIn).toHaveBeenCalledTimes(1);
});

it("gathers packages from every offering, not just the current one", async () => {
  // Only one offering can be `current`, so reading it alone hides any product
  // family configured as its own offering.
  mockPurchases.getOfferings.mockResolvedValue({
    all: {
      credits: { availablePackages: [pack("credits_10"), pack("credits_25")] },
      subs: { availablePackages: [pack("trace_unlimited_monthly")] },
    },
  } as any);

  const states: RevenueCatState[] = [];
  render(<Harness onState={(s) => states.push(s)} />);

  await waitFor(() => expect(states.at(-1)?.packages).toHaveLength(3));
});

it("deduplicates packages that share a product id", async () => {
  // Separate offerings routinely reuse package identifiers like `$rc_monthly`.
  mockPurchases.getOfferings.mockResolvedValue({
    all: {
      a: { availablePackages: [pack("credits_10")] },
      b: { availablePackages: [pack("credits_10")] },
    },
  } as any);

  const states: RevenueCatState[] = [];
  render(<Harness onState={(s) => states.push(s)} />);

  await waitFor(() => expect(states.at(-1)?.isReady).toBe(true));
  expect(states.at(-1)?.packages).toHaveLength(1);
});

it("ignores products that belong to another app", async () => {
  mockPurchases.getOfferings.mockResolvedValue({
    all: { a: { availablePackages: [pack("credits_10"), pack("some_other_sku")] } },
  } as any);

  const states: RevenueCatState[] = [];
  render(<Harness onState={(s) => states.push(s)} />);

  await waitFor(() => expect(states.at(-1)?.isReady).toBe(true));
  expect(states.at(-1)?.packages.map((p) => p.product.identifier)).toEqual(["credits_10"]);
});

it("distinguishes a cancelled purchase from a failed one", () => {
  expect(isUserCancelled({ userCancelled: true })).toBe(true);
  expect(isUserCancelled({ userCancelled: false })).toBe(false);
  expect(isUserCancelled(new Error("billing unavailable"))).toBe(false);
  expect(isUserCancelled(null)).toBe(false);
});
