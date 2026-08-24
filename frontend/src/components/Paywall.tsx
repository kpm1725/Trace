/**
 * The credit paywall.
 *
 * Opened from a 402, or from the credit pill on the home screen. One sheet for
 * everything, because there is one balance — see `backend/billing.py`.
 *
 * Prices are read from the store, never from this file. The store is the only
 * place that knows what a pack costs in the buyer's currency after local tax,
 * and a hardcoded "$4.99" is wrong for most of the world and eventually wrong
 * everywhere.
 */
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { PurchasesPackage } from "react-native-purchases";

import { apiFetch } from "@/src/api/client";
import { isUnlimitedProduct, matchesProduct, CREDIT_PRODUCT_IDS } from "@/src/billing/products";
import { Callout } from "@/src/components/ui";
import { useEntitlement } from "@/src/hooks/use-entitlement";
import { isUserCancelled, useRevenueCat } from "@/src/hooks/use-revenuecat";
import { colors, fonts, gradient, radius, spacing, type } from "@/src/theme";
import { Entitlement } from "@/src/types";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Fired once a purchase is confirmed credited, so the caller can retry. */
  onCredited?: () => void;
  /** Shown above the packs when the paywall opened from a refused call. */
  reason?: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "purchasing" }
  | { kind: "confirming" }
  | { kind: "restoring" }
  | { kind: "message"; tone: "warning" | "info"; title: string; text: string };

export function Paywall({ visible, onClose, onCredited, reason }: Props) {
  const { isReady, packages, error, purchasePackage, restorePurchases } = useRevenueCat();
  const { entitlement, refresh, awaitCredit } = useEntitlement();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const busy =
    status.kind === "purchasing" || status.kind === "confirming" || status.kind === "restoring";

  const buy = useCallback(
    async (pack: PurchasesPackage) => {
      const before: Entitlement | null = await refresh();
      setStatus({ kind: "purchasing" });
      try {
        await purchasePackage(pack);
      } catch (e) {
        // Backing out of the native sheet is not an error to report.
        setStatus(isUserCancelled(e) ? { kind: "idle" } : {
          kind: "message",
          tone: "warning",
          title: "Purchase didn't complete",
          text: e instanceof Error ? e.message : "Nothing was charged. Please try again.",
        });
        return;
      }

      // The sheet completed, so the money has moved. Everything from here is
      // about waiting for the webhook, and none of it may be phrased as the
      // purchase having failed.
      setStatus({ kind: "confirming" });
      const outcome = await awaitCredit(before);
      if (outcome === "credited") {
        setStatus({ kind: "idle" });
        onCredited?.();
        onClose();
        return;
      }
      setStatus({
        kind: "message",
        tone: "info",
        title: "Purchase received",
        text:
          "Your credits are on the way — this occasionally takes a minute. " +
          "They'll appear on their own; tap Restore below if they haven't shortly.",
      });
    },
    [awaitCredit, onClose, onCredited, purchasePackage, refresh],
  );

  const restore = useCallback(async () => {
    setStatus({ kind: "restoring" });
    try {
      // Two halves. The SDK re-reads the device receipt into RevenueCat — only
      // it can do that — and then the server reads the subscriber back under
      // the caller's own id and extends entitlements.
      await restorePurchases();
      const result = await apiFetch<{ restored: string[]; replayed: string[] }>(
        "/billing/restore",
        { method: "POST" },
      );
      const found = result.restored.length + result.replayed.length;
      await refresh();
      setStatus({
        kind: "message",
        tone: "info",
        title: found > 0 ? "Restored" : "Nothing to restore",
        text:
          found > 0
            ? "Your previous purchases are back on this account."
            : "No previous purchases were found for this account.",
      });
      if (found > 0) onCredited?.();
    } catch (e) {
      setStatus({
        kind: "message",
        tone: "warning",
        title: "Couldn't restore",
        text: e instanceof Error ? e.message : "Please try again.",
      });
    }
  }, [onCredited, refresh, restorePurchases]);

  const creditPacks = packages.filter((p) => matchesProduct(p, CREDIT_PRODUCT_IDS));
  const subscriptions = packages.filter(isUnlimitedProduct);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} testID="paywall">
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Out of credits</Text>
              <Text style={styles.subtitle}>
                A diagnosis costs 1 credit, a generated circuit costs 2.
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} testID="paywall-close" disabled={busy}>
              <Ionicons name="close" size={24} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {!!reason && <Text style={styles.reason}>{reason}</Text>}

            {entitlement && (
              <Text style={styles.balance}>
                {entitlement.is_unlimited
                  ? "Unlimited access is active"
                  : `${entitlement.total_available} credit${entitlement.total_available === 1 ? "" : "s"} remaining`}
              </Text>
            )}

            {status.kind === "message" && (
              <Callout tone={status.tone} title={status.title} items={[status.text]} />
            )}

            {!isReady ? (
              <ActivityIndicator color={colors.brand} style={{ marginTop: spacing["2xl"] }} />
            ) : error ? (
              <Callout tone="warning" title="Store unavailable" items={[error]} testID="paywall-error" />
            ) : (
              <>
                {subscriptions.length > 0 && (
                  <>
                    <Text style={styles.groupLabel}>Unlimited</Text>
                    {subscriptions.map((pack) => (
                      <Pressable
                        key={pack.identifier}
                        testID={`paywall-buy-${pack.product.identifier}`}
                        onPress={() => buy(pack)}
                        disabled={busy}
                        style={({ pressed }) => [styles.featuredWrap, pressed && { opacity: 0.9 }]}
                      >
                        <LinearGradient
                          colors={[...gradient.brand]}
                          start={gradient.start}
                          end={gradient.end}
                          style={styles.featured}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.featuredTitle}>{pack.product.title}</Text>
                            <Text style={styles.featuredSub}>
                              Every tool, no credit counting
                            </Text>
                          </View>
                          <Text style={styles.featuredPrice}>{pack.product.priceString}</Text>
                        </LinearGradient>
                      </Pressable>
                    ))}
                  </>
                )}

                {creditPacks.length > 0 && (
                  <>
                    <Text style={styles.groupLabel}>Credit packs</Text>
                    {creditPacks.map((pack) => (
                      <Pressable
                        key={pack.identifier}
                        testID={`paywall-buy-${pack.product.identifier}`}
                        onPress={() => buy(pack)}
                        disabled={busy}
                        style={({ pressed }) => [
                          styles.packRow,
                          pressed && { backgroundColor: colors.surfaceTertiary },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.packTitle}>{pack.product.title}</Text>
                          {!!pack.product.description && (
                            <Text style={styles.packSub}>{pack.product.description}</Text>
                          )}
                        </View>
                        <Text style={styles.packPrice}>{pack.product.priceString}</Text>
                      </Pressable>
                    ))}
                  </>
                )}
              </>
            )}

            {busy && (
              <View style={styles.busyRow} testID="paywall-busy">
                <ActivityIndicator color={colors.brandTertiary} />
                <Text style={styles.busyText}>
                  {status.kind === "confirming"
                    ? "Confirming your purchase…"
                    : status.kind === "restoring"
                      ? "Checking for previous purchases…"
                      : "Opening the store…"}
                </Text>
              </View>
            )}

            <Pressable
              testID="paywall-restore"
              onPress={restore}
              disabled={busy}
              style={({ pressed }) => [styles.restore, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.restoreText}>Already purchased? Restore</Text>
            </Pressable>

            <Text style={styles.fineprint}>
              Purchases are handled by the App Store or Google Play. Credits never expire; an
              unlimited plan renews until cancelled and can be managed in your store account.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(10,6,20,0.7)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: "88%",
    paddingBottom: spacing.xl,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    alignSelf: "center",
    marginTop: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  title: { fontFamily: fonts.sansBold, fontSize: type["2xl"], color: colors.onSurface },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: type.base,
    color: colors.onSurfaceTertiary,
    marginTop: spacing.xs,
  },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.sm },
  reason: { fontFamily: fonts.sans, fontSize: type.base, color: colors.warning },
  balance: { fontFamily: fonts.mono, fontSize: type.sm, color: colors.brandTertiary },
  groupLabel: {
    fontFamily: fonts.sansBold,
    fontSize: type.sm,
    color: colors.onSurfaceTertiary,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: spacing.lg,
  },
  featuredWrap: { borderRadius: radius.md, overflow: "hidden" },
  featured: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  featuredTitle: { fontFamily: fonts.sansBold, fontSize: type.lg, color: colors.onBrandPrimary },
  featuredSub: {
    fontFamily: fonts.sans,
    fontSize: type.sm,
    color: colors.onBrandPrimary,
    opacity: 0.85,
    marginTop: 2,
  },
  featuredPrice: { fontFamily: fonts.mono, fontSize: type.lg, color: colors.onBrandPrimary },
  packRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  packTitle: { fontFamily: fonts.sansMedium, fontSize: type.lg, color: colors.onSurface },
  packSub: {
    fontFamily: fonts.sans,
    fontSize: type.sm,
    color: colors.onSurfaceTertiary,
    marginTop: 2,
  },
  packPrice: { fontFamily: fonts.mono, fontSize: type.lg, color: colors.brandTertiary },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  busyText: { fontFamily: fonts.sans, fontSize: type.base, color: colors.onSurfaceSecondary },
  restore: { paddingVertical: spacing.lg, alignItems: "center" },
  restoreText: {
    fontFamily: fonts.sansMedium,
    fontSize: type.base,
    color: colors.brandTertiary,
  },
  fineprint: {
    fontFamily: fonts.sans,
    fontSize: type.sm,
    lineHeight: 18,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
  },
});
