import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, spacing, type } from "@/src/theme";

// Stub for project history (list/detail pattern, same as Scribe's library
// screen). Wiring this to GET /api/sessions is full feature logic.
export default function History() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="history-screen">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>PROJECT HISTORY</Text>
        <Text style={styles.title}>Past sessions</Text>
      </View>

      <View style={styles.empty}>
        <Ionicons name="folder-open-outline" size={36} color={colors.onSurfaceTertiary} />
        <Text style={styles.emptyText}>Your debug sessions and generated circuits will show up here.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { marginBottom: spacing.lg },
  eyebrow: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.brandAccent, letterSpacing: 3, fontSize: type.sm },
  title: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.onBackground, fontSize: type["2xl"], marginTop: spacing.xs },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyText: { fontFamily: fonts.sans, color: colors.onSurfaceTertiary, textAlign: "center" },
});
