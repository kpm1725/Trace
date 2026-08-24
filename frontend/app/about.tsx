import Constants from "expo-constants";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { VioletSeedLabs } from "@/src/components/VioletSeedLabs";
import { colors, fonts, spacing, type } from "@/src/theme";

export default function About() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const version = Constants.expoConfig?.version ?? "0.1.0";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="about-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurfaceSecondary} />
        </Pressable>
        <Text style={styles.title}>About</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.brand}>Trace</Text>
        <Text style={styles.version}>Version {version}</Text>

        <Text style={styles.copy}>
          Trace reads your board and your symptom and tells you what to measure next. It is a second
          opinion at the bench, not an authority — it says plainly what a photograph cannot settle,
          and every diagnosis carries its own confidence.
        </Text>

        <View style={styles.footer}>
          <VioletSeedLabs variant="tagline" />
        </View>
      </ScrollView>
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
  body: { paddingHorizontal: spacing.xl, paddingBottom: 80, alignItems: "center" },
  brand: {
    fontFamily: fonts.sansBold,
    fontSize: type.display,
    color: colors.onSurface,
    letterSpacing: 2,
    marginTop: spacing.xl,
  },
  version: {
    fontFamily: fonts.mono,
    fontSize: type.sm,
    color: colors.onSurfaceTertiary,
    marginTop: spacing.sm,
  },
  copy: {
    fontFamily: fonts.sans,
    fontSize: type.base,
    lineHeight: 22,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    marginTop: spacing["2xl"],
  },
  footer: { marginTop: spacing["3xl"] },
});
