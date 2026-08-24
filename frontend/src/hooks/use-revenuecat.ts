import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import Purchases, { CustomerInfo, LOG_LEVEL, PurchasesPackage } from "react-native-purchases";

import { useAuth } from "@/src/context/AuthContext";
import { matchesProduct, paywallProductIds } from "@/src/billing/products";

const API_KEY_APPLE = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY || "";
const API_KEY_GOOGLE = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY || "";

// RevenueCat's SDK state is process-global, so configuration and identity live
// at module scope rather than being redone by every component that mounts this
// hook.
let configured = false;
let identifiedUserId: string | null = null;

function configureOnce(): boolean {
  if (configured) return true;
  const apiKey =
    Platform.OS === "ios" ? API_KEY_APPLE : Platform.OS === "android" ? API_KEY_GOOGLE : "";
  // Web has no store. Returning false here is what makes the paywall say so
  // instead of hanging on an SDK call that will never resolve.
  if (!apiKey) return false;

  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
  configured = true;
  return true;
}

/**
 * Bind the RevenueCat customer to the signed-in Trace account.
 *
 * This is the single most important line in the purchase flow. RevenueCat sends
 * this id to the webhook as `app_user_id`, and the webhook credits by looking up
 * `user_id`. Left anonymous, RevenueCat generates a `$RCAnonymousID:…` that
 * matches no user, the webhook's unknown-user branch fires, and the buyer is
 * charged and never credited.
 */
async function syncIdentity(userId: string | null): Promise<void> {
  if (userId === identifiedUserId) return;

  const previous = identifiedUserId;
  identifiedUserId = userId; // claimed before awaiting, so concurrent mounts don't double-call
  try {
    if (userId) {
      await Purchases.logIn(userId);
    } else if (previous) {
      // logOut throws when the customer is already anonymous, hence the guard.
      await Purchases.logOut();
    }
  } catch (e) {
    identifiedUserId = previous;
    throw e;
  }
}

export type RevenueCatState = {
  isReady: boolean;
  packages: PurchasesPackage[];
  customerInfo: CustomerInfo | null;
  /** Set when the store is unreachable or unavailable, with something to show. */
  error: string | null;
  purchasePackage: (pack: PurchasesPackage) => Promise<CustomerInfo>;
  restorePurchases: () => Promise<CustomerInfo>;
};

export function useRevenueCat(): RevenueCatState {
  const { user } = useAuth();
  const userId = user?.user_id ?? null;

  const [isReady, setIsReady] = useState(false);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Every way this can fail leaves `packages` empty, which a paywall cannot
      // tell apart from "still loading" — so each one records why.
      if (!configureOnce()) {
        if (!cancelled) {
          setError(
            Platform.OS === "web"
              ? "Purchases aren't available in the browser — use the app."
              : "In-app purchases aren't set up in this build.",
          );
          setIsReady(true);
        }
        return;
      }

      try {
        await syncIdentity(userId);
      } catch (e) {
        console.error("RevenueCat identity sync failed:", e);
      }

      try {
        const info = await Purchases.getCustomerInfo();
        if (!cancelled) setCustomerInfo(info);

        // Gather from every offering, not just `current`. Only one offering can
        // be current, so reading it alone hides any product family configured
        // as its own offering. Each paywall filters by product id anyway, so a
        // wider pool costs nothing. Deduplicated by product id, since separate
        // offerings routinely reuse package identifiers like `$rc_monthly`.
        const offerings = await Purchases.getOfferings();
        const seen = new Set<string>();
        const available: PurchasesPackage[] = [];
        for (const offering of Object.values(offerings.all ?? {})) {
          for (const pack of offering.availablePackages) {
            if (seen.has(pack.product.identifier)) continue;
            seen.add(pack.product.identifier);
            available.push(pack);
          }
        }

        const ours = available.filter((p) => matchesProduct(p, paywallProductIds()));
        if (!cancelled) {
          setPackages(ours);
          setError(
            ours.length === 0
              ? "No purchase options are set up yet. Check back shortly."
              : null,
          );
        }
      } catch (e) {
        console.error("Error fetching RevenueCat offerings:", e);
        if (!cancelled) setError("Couldn't reach the store. Check your connection and try again.");
      } finally {
        if (!cancelled) setIsReady(true);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const purchasePackage = useCallback(
    async (pack: PurchasesPackage) => {
      // Last line of defence: never let money move against an anonymous
      // customer, because that purchase cannot be credited back to an account.
      if (!userId) throw new Error("You must be signed in to make a purchase.");
      await syncIdentity(userId);

      const { customerInfo: info } = await Purchases.purchasePackage(pack);
      setCustomerInfo(info);
      return info;
    },
    [userId],
  );

  /**
   * Re-read the store's receipt into RevenueCat.
   *
   * This is the half the server cannot do: it makes the SDK re-sync what the
   * device actually owns and push it to RevenueCat, so a subscription the
   * webhook never recorded becomes visible to `POST /billing/restore`.
   */
  const restorePurchases = useCallback(async () => {
    if (!userId) throw new Error("You must be signed in to restore purchases.");
    await syncIdentity(userId);
    const info = await Purchases.restorePurchases();
    setCustomerInfo(info);
    return info;
  }, [userId]);

  return { isReady, packages, customerInfo, error, purchasePackage, restorePurchases };
}

/** True when the user backed out of the native sheet — not an error to report. */
export function isUserCancelled(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { userCancelled?: boolean }).userCancelled === true;
}
