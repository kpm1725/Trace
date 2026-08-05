import { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiFetch, ApiError } from "@/src/api/client";
import { useBilling } from "@/src/context/BillingContext";
import Paywall from "@/src/components/Paywall";
import CircuitResult, { CircuitResultData } from "@/src/components/CircuitResult";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

export default function Generate() {
  const insets = useSafeAreaInsets();
  const { entitlement, refresh } = useBilling();
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CircuitResultData | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  const generate = async () => {
    if (!description.trim()) {
      Alert.alert("Describe a circuit", "Give Trace something to work with, e.g. a 555 timer LED blinker.");
      return;
    }
    setBusy(true);
    try {
      const data = await apiFetch<{ session: { result: CircuitResultData } }>("/generate", {
        method: "POST",
        body: { description: description.trim() },
      });
      setResult(data.session.result);
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        setShowPaywall(true);
      } else {
        Alert.alert("Generation failed", e instanceof Error ? e.message : "Something went wrong.");
      }
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <ScrollView style={[styles.root, { paddingTop: insets.top }]} testID="generate-screen">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>GENERATE FROM PROMPT</Text>
          <Text style={styles.title}>Describe a circuit.</Text>
        </View>
        {entitlement && (
          <Text style={styles.credits}>{entitlement.is_unlimited ? "∞" : entitlement.total_available} credits</Text>
        )}
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

      <Pressable testID="generate-button" style={styles.cta} onPress={generate} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Generate</Text>}
      </Pressable>

      {result ? (
        <View style={styles.resultsBox}>
          <CircuitResult result={result} />
        </View>
      ) : (
        <View style={styles.previewBox}>
          <Text style={styles.previewText}>Diagram, parts list, and wiring steps will appear here.</Text>
        </View>
      )}

      <Paywall visible={showPaywall} onClose={() => setShowPaywall(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.lg },
  eyebrow: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.brandAccent, letterSpacing: 3, fontSize: type.sm },
  title: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.onBackground, fontSize: type["2xl"], marginTop: spacing.xs },
  credits: { fontFamily: fonts.sansMedium, fontWeight: "600", color: colors.brandAccent, fontSize: type.sm, marginTop: spacing.xs },
  label: { fontFamily: fonts.sansMedium, fontWeight: "600", color: colors.onSurfaceSecondary, marginBottom: spacing.xs },
  input: {
    minHeight: 100, borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, color: colors.onSurface,
    padding: spacing.md, textAlignVertical: "top", marginBottom: spacing.lg,
  },
  cta: { backgroundColor: colors.brandPrimary, paddingVertical: 16, borderRadius: radius.pill, alignItems: "center", marginBottom: spacing.lg },
  ctaText: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.onBrandPrimary, fontSize: type.lg },
  resultsBox: { marginBottom: spacing.xl },
  previewBox: {
    minHeight: 180, borderRadius: radius.lg, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", padding: spacing.lg, marginBottom: spacing.xl,
  },
  previewText: { fontFamily: fonts.sans, color: colors.onSurfaceTertiary, textAlign: "center" },
});
