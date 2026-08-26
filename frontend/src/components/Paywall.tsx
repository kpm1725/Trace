import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ActivityIndicator, Alert, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PurchasesPackage } from "react-native-purchases";

import { useBilling } from "@/src/context/BillingContext";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function Paywall({ visible, onClose }: Props) {
  const { entitlement, offering, purchase, restore } = useBilling();
  const [busyId, setBusyId] = useState<string | null>(null);

  const buy = async (pkg: PurchasesPackage) => {
    setBusyId(pkg.identifier);
    try {
      await purchase(pkg);
      onClose();
    } catch (e: any) {
      if (!e?.userCancelled) {
        Alert.alert("Purchase failed", e?.message || "Something went wrong. Please try again.");
      }
    } finally {
      setBusyId(null);
    }
  };

  const onRestore = async () => {
    setBusyId("restore");
    try {
      await restore();
      Alert.alert("Restored", "Your purchases have been restored.");
    } catch (e: any) {
      Alert.alert("Restore failed", e?.message || "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Get more credits</Text>
            <Pressable testID="paywall-close" onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.onSurfaceSecondary} />
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            {entitlement
              ? `${entitlement.total_available} credit${entitlement.total_available === 1 ? "" : "s"} remaining`
              : "Loading your balance…"}
          </Text>

          <ScrollView style={{ maxHeight: 360 }}>
            {!offering && (
              <Text style={styles.empty}>
                Products aren't loaded yet — make sure RevenueCat offerings are configured and the app has a
                RevenueCat API key set.
              </Text>
            )}
            {offering?.availablePackages.map((pkg) => (
              <Pressable
                key={pkg.identifier}
                testID={`paywall-buy-${pkg.identifier}`}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
                onPress={() => buy(pkg)}
                disabled={busyId !== null}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{pkg.product.title || pkg.identifier}</Text>
                  {!!pkg.product.description && <Text style={styles.cardDesc}>{pkg.product.description}</Text>}
                </View>
                {busyId === pkg.identifier ? (
                  <ActivityIndicator color={colors.brandAccent} />
                ) : (
                  <Text style={styles.cardPrice}>{pkg.product.priceString}</Text>
                )}
              </Pressable>
            ))}
          </ScrollView>

          <Pressable testID="paywall-restore" onPress={onRestore} disabled={busyId !== null} style={styles.restore}>
            {busyId === "restore" ? (
              <ActivityIndicator color={colors.onSurfaceSecondary} />
            ) : (
              <Text style={styles.restoreText}>Restore purchases</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg, paddingBottom: spacing.xl,
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  title: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.onSurface, fontSize: type.xl },
  subtitle: { fontFamily: fonts.sans, color: colors.onSurfaceSecondary, marginBottom: spacing.lg },
  empty: { fontFamily: fonts.sans, color: colors.onSurfaceTertiary, padding: spacing.md, textAlign: "center" },
  card: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border,
  },
  cardTitle: { fontFamily: fonts.sansMedium, fontWeight: "600", color: colors.onSurface, fontSize: type.base },
  cardDesc: { fontFamily: fonts.sans, color: colors.onSurfaceTertiary, fontSize: type.sm, marginTop: 2 },
  cardPrice: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.brandAccent, fontSize: type.base },
  restore: { alignItems: "center", marginTop: spacing.sm, paddingVertical: spacing.sm },
  restoreText: { fontFamily: fonts.sans, color: colors.onSurfaceSecondary, textDecorationLine: "underline" },
});
