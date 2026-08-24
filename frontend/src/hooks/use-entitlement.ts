import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "@/src/api/client";
import { Entitlement } from "@/src/types";

/**
 * How long to wait for a purchase to show up in the balance.
 *
 * Fulfilment is server-side: RevenueCat POSTs the webhook, the webhook credits
 * MongoDB, and only then does `/billing/entitlements` change. That round trip is
 * usually a second or two and occasionally much longer, so the app polls rather
 * than being told synchronously.
 */
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 25000;

/** Did `after` grant anything `before` didn't? */
function creditIncreased(before: Entitlement | null, after: Entitlement): boolean {
  if (!before) return true;
  if (after.total_available > before.total_available) return true;
  if (after.is_unlimited && !before.is_unlimited) return true;
  // A renewal or an upgrade moves the expiry without flipping the flag.
  if (after.unlimited_until && before.unlimited_until) {
    return new Date(after.unlimited_until) > new Date(before.unlimited_until);
  }
  return !!after.unlimited_until && !before.unlimited_until;
}

export type CreditWait = "credited" | "pending";

export function useEntitlement() {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<Entitlement | null> => {
    try {
      const next = await apiFetch<Entitlement>("/billing/entitlements");
      if (mounted.current) setEntitlement(next);
      return next;
    } catch {
      // The balance is informational everywhere it's shown; the gate is
      // enforced server-side at the point of use. A failed read must not block
      // the UI or, worse, look like a balance of zero.
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      if (mounted.current) setLoading(false);
    })();
  }, [refresh]);

  /**
   * Poll until the purchase lands, or until we've waited long enough.
   *
   * Returns `"pending"`, never `"failed"`. By the time this is called the money
   * has already moved — the native sheet completed — so a slow or lost webhook
   * is not something to report to the buyer as a failure. `"pending"` is the
   * caller's cue to say it'll appear shortly and offer Restore.
   */
  const awaitCredit = useCallback(
    async (before: Entitlement | null): Promise<CreditWait> => {
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (!mounted.current) return "pending";
        const next = await refresh();
        if (next && creditIncreased(before, next)) return "credited";
      }
      return "pending";
    },
    [refresh],
  );

  return { entitlement, loading, refresh, awaitCredit };
}
