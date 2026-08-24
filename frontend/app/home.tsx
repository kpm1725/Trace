import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Paywall } from "@/src/components/Paywall";
import { VioletSeedLabs } from "@/src/components/VioletSeedLabs";
import { useAuth } from "@/src/context/AuthContext";
import { useEntitlement } from "@/src/hooks/use-entitlement";
import { colors, fonts, gradient, radius, spacing, type } from "@/src/theme";

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { entitlement, refresh } = useEntitlement();
  const [paywallOpen, setPaywallOpen] = useState(false);

  // Coming back from a completed run, the balance has changed.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const credits = entitlement?.is_unlimited
    ? "Unlimited"
    : entitlement
      ? `${entitlement.total_available} credit${entitlement.total_available === 1 ? "" : "s"}`
      : "";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="home-screen">
      {paywallOpen && (
        <Paywall visible onClose={() => setPaywallOpen(false)} onCredited={refresh} />
      )}

      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>
            {(user?.name || user?.email || "BENCH").split(" ")[0].toUpperCase()}
          </Text>
          <Text style={styles.title}>Trace</Text>
        </View>
        <View style={styles.headerRight}>
          {!!credits && (
            <Pressable
              testID="home-credit-pill"
              onPress={() => setPaywallOpen(true)}
              hitSlop={8}
              style={({ pressed }) => [styles.creditPill, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="flash-outline" size={13} color={colors.brandTertiary} />
              <Text style={styles.creditText}>{credits}</Text>
            </Pressable>
          )}
          <Pressable testID="home-signout-button" onPress={signOut} hitSlop={10}>
            <Ionicons name="log-out-outline" size={22} color={colors.onSurfaceSecondary} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <Pressable
          testID="home-debug-card"
          onPress={() => router.push("/debug")}
          style={({ pressed }) => [styles.cardWrap, pressed && { opacity: 0.9 }]}
        >
          <LinearGradient
            colors={[...gradient.brand]}
            start={gradient.start}
            end={gradient.end}
            style={styles.card}
          >
            <Ionicons name="camera-outline" size={30} color={colors.onBrandPrimary} />
            <Text style={styles.cardTitle}>Debug from photo</Text>
            <Text style={styles.cardSub}>
              Photograph the board, describe what it&apos;s doing, get ranked causes and the
              measurement that settles it.
            </Text>
          </LinearGradient>
        </Pressable>

        <Pressable
          testID="home-generate-card"
          onPress={() => router.push("/generate")}
          style={({ pressed }) => [
            styles.cardWrap,
            styles.cardOutline,
            pressed && { backgroundColor: colors.surfaceSecondary },
          ]}
        >
          <View style={styles.card}>
            <Ionicons name="git-network-outline" size={30} color={colors.brandTertiary} />
            <Text style={[styles.cardTitle, { color: colors.onSurface }]}>Generate from prompt</Text>
            <Text style={[styles.cardSub, { color: colors.onSurfaceTertiary }]}>
              Describe a circuit in plain English. Get a diagram, a parts list, and wiring steps.
            </Text>
          </View>
        </Pressable>

        <View style={styles.secondaryRow}>
          <Pressable
            testID="home-history-link"
            onPress={() => router.push("/history")}
            style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="time-outline" size={18} color={colors.onSurfaceSecondary} />
            <Text style={styles.secondaryText}>History</Text>
          </Pressable>
          <Pressable
            testID="home-reference-link"
            onPress={() => router.push("/reference")}
            style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="book-outline" size={18} color={colors.onSurfaceSecondary} />
            <Text style={styles.secondaryText}>Reference</Text>
          </Pressable>
          <Pressable
            testID="home-about-link"
            onPress={() => router.push("/about")}
            style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="information-circle-outline" size={18} color={colors.onSurfaceSecondary} />
            <Text style={styles.secondaryText}>About</Text>
          </Pressable>
        </View>

        <VioletSeedLabs variant="byline" style={{ marginTop: spacing["3xl"] }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: type.sm,
    color: colors.onSurfaceTertiary,
    letterSpacing: 1.5,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: type.display,
    color: colors.onSurface,
    letterSpacing: 1,
    marginTop: spacing.xs,
  },
  creditPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  creditText: { fontFamily: fonts.mono, fontSize: type.sm, color: colors.brandTertiary },
  cardWrap: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  cardOutline: { borderWidth: 1, borderColor: colors.border },
  card: { padding: spacing.xl, gap: spacing.md },
  cardTitle: { fontFamily: fonts.sansBold, fontSize: type.xl, color: colors.onBrandPrimary },
  cardSub: {
    fontFamily: fonts.sans,
    fontSize: type.base,
    lineHeight: 20,
    color: colors.onBrandPrimary,
    opacity: 0.9,
  },
  secondaryRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xl,
    marginTop: spacing.lg,
  },
  secondary: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  secondaryText: {
    fontFamily: fonts.sansMedium,
    fontSize: type.base,
    color: colors.onSurfaceSecondary,
  },
});
