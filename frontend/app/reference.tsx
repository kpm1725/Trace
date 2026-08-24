/**
 * Component reference — DEFERRED to v1.1.
 *
 * The prompt marks this low priority and explicitly allows stubbing it if it
 * threatens the MVP. It does: a useful pinout reference is a content project,
 * not a code one — a few hundred hand-checked parts, each wrong entry costing
 * someone a component. That is worth doing properly rather than quickly, and
 * nothing else in the MVP depends on it.
 *
 * The screen exists so the navigation is complete and the entry point does not
 * have to be added later.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, spacing, type } from "@/src/theme";

export default function Reference() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="reference-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurfaceSecondary} />
        </Pressable>
        <Text style={styles.title}>Reference</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.center}>
        <Ionicons name="book-outline" size={42} color={colors.onSurfaceTertiary} />
        <Text style={styles.heading}>Coming in a later release</Text>
        <Text style={styles.sub}>
          Pinouts and common gotchas for the parts you actually keep in a drawer. Until then, ask
          about a part in a debug session — the diagnosis knows its pinout.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  title: { fontFamily: fonts.sansMedium, fontSize: type.lg, color: colors.onSurface },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingHorizontal: spacing["2xl"],
    paddingBottom: 80,
  },
  heading: { fontFamily: fonts.sansBold, fontSize: type.xl, color: colors.onSurface },
  sub: {
    fontFamily: fonts.sans,
    fontSize: type.base,
    lineHeight: 21,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
  },
});
