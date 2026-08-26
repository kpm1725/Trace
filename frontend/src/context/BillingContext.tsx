import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import Purchases, { PurchasesOffering, PurchasesPackage } from "react-native-purchases";

import { apiFetch } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || "";
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || "";

export type Entitlement = {
  free_credits_remaining: number;
  paid_credits: number;
  total_available: number;
  is_unlimited: boolean;
  unlimited_until: string | null;
};

type BillingCtx = {
  entitlement: Entitlement | null;
  offering: PurchasesOffering | null;
  ready: boolean;
  refresh: () => Promise<void>;
  purchase: (pkg: PurchasesPackage) => Promise<void>;
  restore: () => Promise<void>;
};

const Ctx = createContext<BillingCtx>({
  entitlement: null,
  offering: null,
  ready: false,
  refresh: async () => {},
  purchase: async () => {},
  restore: async () => {},
});

// RevenueCat mediates native IAP (Apple/Google) — see README.md for why
// RevenueCat instead of raw react-native-iap/expo-iap. appUserID is set to
// our own user_id so RevenueCat webhooks land with the same id used in Mongo.
export const BillingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    if (!user || configured) return;
    const apiKey = Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY;
    if (!apiKey) {
      console.warn("RevenueCat API key missing — set EXPO_PUBLIC_REVENUECAT_*_KEY to enable billing.");
      return;
    }
    Purchases.configure({ apiKey, appUserID: user.user_id });
    setConfigured(true);
  }, [user, configured]);

  const fetchEntitlement = useCallback(async () => {
    try {
      const data = await apiFetch<{ entitlement: Entitlement }>("/billing/entitlements");
      setEntitlement(data.entitlement);
    } catch (e) {
      console.warn("Failed to fetch entitlement", e);
    }
  }, []);

  const fetchOffering = useCallback(async () => {
    if (!configured) return;
    try {
      const offerings = await Purchases.getOfferings();
      setOffering(offerings.current);
    } catch (e) {
      console.warn("Failed to fetch RevenueCat offerings", e);
    }
  }, [configured]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchEntitlement(), fetchOffering()]);
  }, [fetchEntitlement, fetchOffering]);

  useEffect(() => {
    if (!user) return;
    refresh();
  }, [user, configured, refresh]);

  const purchase = useCallback(async (pkg: PurchasesPackage) => {
    await Purchases.purchasePackage(pkg);
    // Immediate sync covers the unlimited pass right away; consumable credit
    // packs are credited by the webhook, which can lag a couple seconds, so
    // we take one more look shortly after instead of blocking the UI on it.
    try { await apiFetch("/billing/sync", { method: "POST" }); } catch {}
    await fetchEntitlement();
    setTimeout(fetchEntitlement, 2500);
  }, [fetchEntitlement]);

  const restore = useCallback(async () => {
    await Purchases.restorePurchases();
    try { await apiFetch("/billing/sync", { method: "POST" }); } catch {}
    await fetchEntitlement();
  }, [fetchEntitlement]);

  return (
    <Ctx.Provider value={{ entitlement, offering, ready: configured, refresh, purchase, restore }}>
      {children}
    </Ctx.Provider>
  );
};

export const useBilling = () => useContext(Ctx);
