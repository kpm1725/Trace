import { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, radius, spacing, type } from "@/src/theme";

// Stub screen for "Generate from prompt". The Claude call, structured
// circuit JSON (components/nodes/connections), client-side diagram
// rendering, and parts list are full feature logic — built after the
// scaffold is confirmed.
export default function Generate() {
  const insets = useSafeAreaInsets();
  const [description, setDescription] = useState("");

  const generate = () => {
    Alert.alert("Coming soon", "Generating a circuit diagram + parts list from this description is the next build step.");
  };

  return (
    <ScrollView style={[styles.root, { paddingTop: insets.top }]} testID="generate-screen">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>GENERATE FROM PROMPT</Text>
        <Text style={styles.title}>Describe a circuit.</Text>
      </View>

      <Text style={styles.label}>Circuit description</Text>
      <TextInput
        testID="generate-description-input"
        style={styles.input}
        placeholder="e.g. 555 timer astable LED blinker, 9V supply"
        placeholderTextColor={colors.onSurfaceTertiary}
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Pressable testID="generate-button" style={styles.cta} onPress={generate}>
        <Text style={styles.ctaText}>Generate</Text>
      </Pressable>

      <View style={styles.previewBox}>
        <Text style={styles.previewText}>Diagram, parts list, and wiring steps will appear here.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { marginBottom: spacing.lg },
  eyebrow: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.brandAccent, letterSpacing: 3, fontSize: type.sm },
  title: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.onBackground, fontSize: type["2xl"], marginTop: spacing.xs },
  label: { fontFamily: fonts.sansMedium, fontWeight: "600", color: colors.onSurfaceSecondary, marginBottom: spacing.xs },
  input: {
    minHeight: 100, borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, color: colors.onSurface,
    padding: spacing.md, textAlignVertical: "top", marginBottom: spacing.lg,
  },
  cta: { backgroundColor: colors.brandPrimary, paddingVertical: 16, borderRadius: radius.pill, alignItems: "center", marginBottom: spacing.lg },
  ctaText: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.onBrandPrimary, fontSize: type.lg },
  previewBox: {
    minHeight: 180, borderRadius: radius.lg, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", padding: spacing.lg, marginBottom: spacing.xl,
  },
  previewText: { fontFamily: fonts.sans, color: colors.onSurfaceTertiary, textAlign: "center" },
});
