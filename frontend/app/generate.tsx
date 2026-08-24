/**
 * Generate from prompt.
 *
 * Owns the description form and the call. The result — diagram, parts list,
 * wiring steps and netlist — is rendered by `<CircuitResult>`, shared with
 * `session/[id].tsx`.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, apiFetch } from "@/src/api/client";
import { CircuitResult } from "@/src/components/CircuitResult";
import { Paywall } from "@/src/components/Paywall";
import { colors, fonts, gradient, radius, spacing, type } from "@/src/theme";
import { Circuit, TraceSession } from "@/src/types";

const EXAMPLES = [
  "555 timer astable LED blinker, 9V supply",
  "Battery level indicator with 4 LEDs",
  "Debounced pushbutton input for an Arduino",
];

export default function GenerateFromPrompt() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Circuit | null>(null);
  const [paywall, setPaywall] = useState<string | null>(null);

  async function submit() {
    if (!description.trim()) return;
    setPaywall(null);
    setBusy(true);
    setError(null);
    try {
      const { session } = await apiFetch<{ session: TraceSession }>("/generate", {
        method: "POST",
        body: { description: description.trim() },
      });
      setResult(session.result as Circuit);
    } catch (e) {
      if (e instanceof ApiError && e.isPaywall) {
        const needed = e.detail?.needed ?? 2;
        const available = e.detail?.available ?? 0;
        setPaywall(
          `A generated circuit costs ${needed} credit${needed === 1 ? "" : "s"} and you have ${available}.`,
        );
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = description.trim().length > 0 && !busy;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="generate-screen">
      {paywall !== null && (
        <Paywall
          visible
          reason={paywall}
          onClose={() => setPaywall(null)}
          onCredited={submit}
        />
      )}

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurfaceSecondary} />
        </Pressable>
        <Text style={styles.title}>Generate from prompt</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Describe the circuit</Text>
        <TextInput
          testID="generate-description-input"
          value={description}
          onChangeText={setDescription}
          placeholder="555 timer astable LED blinker, 9V supply"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.input}
          multiline
        />

        <View style={styles.chips}>
          {EXAMPLES.map((ex) => (
            <Pressable
              key={ex}
              onPress={() => setDescription(ex)}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.chipText}>{ex}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          testID="generate-submit-button"
          onPress={submit}
          disabled={!canSubmit}
          style={[styles.submitWrap, !canSubmit && { opacity: 0.4 }]}
        >
          <LinearGradient
            colors={[...gradient.brand]}
            start={gradient.start}
            end={gradient.end}
            style={styles.submit}
          >
            {busy ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.submitText}>Generate</Text>
            )}
          </LinearGradient>
        </Pressable>

        {!!error && (
          <Text style={styles.error} testID="generate-error">
            {error}
          </Text>
        )}

        {result && (
          <View style={styles.result} testID="generate-result">
            <CircuitResult circuit={result} />
          </View>
        )}
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
  body: { paddingHorizontal: spacing.xl, paddingBottom: 80, gap: spacing.md },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: type.sm,
    color: colors.onSurfaceTertiary,
    letterSpacing: 0.5,
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: type.lg,
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    minHeight: 120,
    textAlignVertical: "top",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: { fontFamily: fonts.mono, fontSize: type.sm, color: colors.onSurfaceTertiary },
  submitWrap: { borderRadius: radius.pill, overflow: "hidden", marginTop: spacing.md },
  submit: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.lg },
  submitText: {
    fontFamily: fonts.sansBold,
    fontSize: type.lg,
    color: colors.onBrandPrimary,
    letterSpacing: 0.5,
  },
  error: { fontFamily: fonts.sans, fontSize: type.base, color: colors.error },
  result: { marginTop: spacing.lg },
});
