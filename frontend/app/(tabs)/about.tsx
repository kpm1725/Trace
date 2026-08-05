import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";

import { useAuth } from "@/src/context/AuthContext";
import { useBilling } from "@/src/context/BillingContext";
import Paywall from "@/src/components/Paywall";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

export default function About() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { entitlement } = useBilling();
  const [showPaywall, setShowPaywall] = useState(false);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="about-screen">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ABOUT</Text>
        <Text style={styles.title}>Trace</Text>
      </View>

      {user ? <Text style={styles.meta}>Signed in as {user.email}</Text> : null}
      <Text style={styles.meta}>Version {Constants.expoConfig?.version ?? "1.0.0"}</Text>

      <View style={styles.billingCard}>
        <View>
          <Text style={styles.billingLabel}>Your balance</Text>
          <Text style={styles.billingValue}>
            {entitlement ? (entitlement.is_unlimited ? "Unlimited" : `${entitlement.total_available} credits`) : "…"}
          </Text>
        </View>
        <Pressable testID="about-upgrade-button" style={styles.upgradeBtn} onPress={() => setShowPaywall(true)}>
          <Text style={styles.upgradeBtnText}>Get more</Text>
        </Pressable>
      </View>

      <View style={styles.credit}>
        <Text style={styles.creditLabel}>Made by</Text>
        <Text style={styles.creditName}>Violet Seed Labs</Text>
        <Text style={styles.creditTagline}>Built to grow</Text>
      </View>

      <Pressable testID="about-signout-button" style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <Paywall visible={showPaywall} onClose={() => setShowPaywall(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { marginBottom: spacing.lg },
  eyebrow: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.brandAccent, letterSpacing: 3, fontSize: type.sm },
  title: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.onBackground, fontSize: type["2xl"], marginTop: spacing.xs },
  meta: { fontFamily: fonts.sans, color: colors.onSurfaceSecondary, marginBottom: spacing.xs },
  billingCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginTop: spacing.lg,
  },
  billingLabel: { fontFamily: fonts.sans, color: colors.onSurfaceTertiary, fontSize: type.sm },
  billingValue: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.onSurface, fontSize: type.lg, marginTop: 2 },
  upgradeBtn: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  upgradeBtnText: { fontFamily: fonts.sansMedium, fontWeight: "600", color: colors.onBrandPrimary, fontSize: type.sm },
  credit: { marginTop: spacing["2xl"], marginBottom: spacing["2xl"] },
  creditLabel: { fontFamily: fonts.sans, color: colors.onSurfaceTertiary, fontSize: type.sm },
  creditName: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.brandAccent, fontSize: type.xl, marginTop: 2 },
  creditTagline: { fontFamily: fonts.sans, color: colors.onSurfaceSecondary, fontStyle: "italic", marginTop: 2 },
  signOut: {
    marginTop: "auto", marginBottom: spacing.xl, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, paddingVertical: 14, alignItems: "center",
  },
  signOutText: { fontFamily: fonts.sansMedium, fontWeight: "600", color: colors.onSurface },
});
