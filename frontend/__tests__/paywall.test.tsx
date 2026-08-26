/**
 * The purchase flow's async states.
 *
 * By the time the native sheet returns, the money has moved. Everything after
 * that is waiting on a webhook, and none of it may be phrased as the purchase
 * having failed — that is the behaviour these tests exist to hold.
 *
 * Identity binding is tested in `use-revenuecat.test.tsx` rather than here.
 * RevenueCat's SDK state is process-global, so `use-revenuecat` deliberately
 * caches `configured` and `identifiedUserId` at module scope, and only the
 * first test in a file would see `logIn` called. Jest gives each *file* a fresh
 * module registry, which is the isolation that assertion needs.
 *
 * Fake timers throughout, because `awaitCredit` polls for up to 25 seconds.
 * Advancing them explicitly is both faster and the only way the poll's own
 * timing is actually under test.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import Purchases from "react-native-purchases";

import { apiFetch } from "@/src/api/client";
import { Paywall } from "@/src/components/Paywall";

jest.mock("@/src/api/client", () => ({
  ...jest.requireActual("@/src/api/client"),
  apiFetch: jest.fn(),
}));

jest.mock("@/src/context/AuthContext", () => ({
  useAuth: () => ({ user: { user_id: "user_1", email: "a@b.c", name: "A" } }),
}));

const creditPack = {
  identifier: "$rc_custom_credits_25",
  product: {
    identifier: "credits_25",
    title: "25 credits",
    description: "Enough for 25 diagnoses",
    priceString: "£3.99",
  },
} as any;

function entitlement(total: number) {
  return {
    free_credits_used: 5,
    free_credits_remaining: 0,
    paid_credits: total,
    total_available: total,
    is_unlimited: false,
    unlimited_until: null,
    is_trace_unlimited: false,
  };
}

const mockApiFetch = apiFetch as jest.Mock;
const mockPurchases = Purchases as jest.Mocked<typeof Purchases>;

function setup(offerings: any = { all: { default: { availablePackages: [creditPack] } } }) {
  mockPurchases.getOfferings.mockResolvedValue(offerings);
  mockPurchases.getCustomerInfo.mockResolvedValue({} as any);
  mockPurchases.logIn.mockResolvedValue({} as any);
  mockPurchases.purchasePackage.mockResolvedValue({ customerInfo: {} } as any);
  mockPurchases.restorePurchases.mockResolvedValue({} as any);
  return { Purchases: mockPurchases, apiFetch: mockApiFetch, Paywall };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

it("lists packs with the store's price, not a hardcoded one", async () => {
  const { apiFetch, Paywall } = setup();
  apiFetch.mockResolvedValue(entitlement(0));

  render(<Paywall visible onClose={jest.fn()} />);

  expect(await screen.findByTestId("paywall-buy-credits_25")).toBeTruthy();
  expect(screen.getByText("£3.99")).toBeTruthy();
  expect(screen.getByText("25 credits")).toBeTruthy();
});

it("says so when the store returns no products", async () => {
  const { apiFetch, Paywall } = setup({ all: {} });
  apiFetch.mockResolvedValue(entitlement(0));

  render(<Paywall visible onClose={jest.fn()} />);

  expect(await screen.findByTestId("paywall-error")).toBeTruthy();
  expect(screen.getByText(/No purchase options are set up yet/)).toBeTruthy();
});

it("says so when the store is unreachable", async () => {
  const { Purchases, apiFetch, Paywall } = setup();
  apiFetch.mockResolvedValue(entitlement(0));
  Purchases.getOfferings.mockRejectedValue(new Error("network down"));

  render(<Paywall visible onClose={jest.fn()} />);

  expect(await screen.findByTestId("paywall-error")).toBeTruthy();
  expect(screen.getByText(/Couldn't reach the store/)).toBeTruthy();
});

it("closes once the webhook credits the account", async () => {
  const { apiFetch, Paywall } = setup();
  const onClose = jest.fn();
  const onCredited = jest.fn();
  apiFetch
    .mockResolvedValueOnce(entitlement(0)) // first render's balance
    .mockResolvedValueOnce(entitlement(0)) // the `before` snapshot
    .mockResolvedValue(entitlement(25)); // the webhook has landed

  render(<Paywall visible onClose={onClose} onCredited={onCredited} />);
  fireEvent.press(await screen.findByTestId("paywall-buy-credits_25"));

  await waitFor(() => expect(screen.getByTestId("paywall-busy")).toBeTruthy());
  expect(screen.getByText(/Confirming your purchase/)).toBeTruthy();

  await jest.advanceTimersByTimeAsync(2000); // past one poll interval

  await waitFor(() => expect(onCredited).toHaveBeenCalled());
  expect(onClose).toHaveBeenCalled();
});

it("never calls a slow webhook a failed purchase", async () => {
  const { apiFetch, Paywall } = setup();
  const onClose = jest.fn();
  // The balance never moves — the webhook is lost or very late.
  apiFetch.mockResolvedValue(entitlement(0));

  render(<Paywall visible onClose={onClose} />);
  fireEvent.press(await screen.findByTestId("paywall-buy-credits_25"));

  await waitFor(() => expect(screen.getByTestId("paywall-busy")).toBeTruthy());
  await jest.advanceTimersByTimeAsync(30000); // past the whole poll window

  const message = await screen.findByText(/on the way/i);
  expect(message).toBeTruthy();
  // The money moved. Nothing here may read as a failure, and the sheet stays
  // open so Restore is within reach.
  expect(screen.queryByText(/failed/i)).toBeNull();
  expect(screen.getByText(/Purchase received/)).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
});

it("treats backing out of the sheet as a non-event", async () => {
  const { Purchases, apiFetch, Paywall } = setup();
  apiFetch.mockResolvedValue(entitlement(0));
  Purchases.purchasePackage.mockRejectedValue({ userCancelled: true });

  render(<Paywall visible onClose={jest.fn()} />);
  fireEvent.press(await screen.findByTestId("paywall-buy-credits_25"));

  await waitFor(() => expect(Purchases.purchasePackage).toHaveBeenCalled());
  expect(screen.queryByText(/didn't complete/i)).toBeNull();
  expect(screen.queryByTestId("paywall-busy")).toBeNull();
});

it("reports a genuine purchase failure", async () => {
  const { Purchases, apiFetch, Paywall } = setup();
  apiFetch.mockResolvedValue(entitlement(0));
  Purchases.purchasePackage.mockRejectedValue(
    Object.assign(new Error("Billing unavailable"), { userCancelled: false }),
  );

  render(<Paywall visible onClose={jest.fn()} />);
  fireEvent.press(await screen.findByTestId("paywall-buy-credits_25"));

  expect(await screen.findByText(/didn't complete/i)).toBeTruthy();
});

it("restore asks the SDK first, then the server", async () => {
  const { Purchases, apiFetch, Paywall } = setup();
  apiFetch.mockResolvedValue({ restored: ["trace_unlimited_monthly"], replayed: [] });

  render(<Paywall visible onClose={jest.fn()} />);
  fireEvent.press(await screen.findByTestId("paywall-restore"));

  // Only the SDK can re-read the device receipt into RevenueCat; the server
  // cannot see a purchase until it has.
  await waitFor(() => expect(Purchases.restorePurchases).toHaveBeenCalled());
  expect(apiFetch).toHaveBeenCalledWith("/billing/restore", { method: "POST" });
  expect(await screen.findByText(/^Restored$/)).toBeTruthy();
});

it("says plainly when there was nothing to restore", async () => {
  const { apiFetch, Paywall } = setup();
  apiFetch.mockResolvedValue({ restored: [], replayed: [] });

  render(<Paywall visible onClose={jest.fn()} />);
  fireEvent.press(await screen.findByTestId("paywall-restore"));

  expect(await screen.findByText(/Nothing to restore/)).toBeTruthy();
});

it("counts a replayed delivery as a restore", async () => {
  const { apiFetch, Paywall } = setup();
  // A credit pack whose webhook never landed, recovered from the stored event.
  apiFetch.mockResolvedValue({ restored: [], replayed: ["credits_25"] });

  render(<Paywall visible onClose={jest.fn()} />);
  fireEvent.press(await screen.findByTestId("paywall-restore"));

  expect(await screen.findByText(/^Restored$/)).toBeTruthy();
});
