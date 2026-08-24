/**
 * Generate from prompt — SCAFFOLD.
 *
 * Complete: the description form and the API call.
 * Not built yet: the circuit diagram. The response carries a full netlist
 * (`result.nets`), and turning that into a drawing is the largest single piece
 * of work in the MVP — see README, "Rendering the netlist". Until then the
 * parts list and wiring steps render as text, which is already the useful half
 * of the answer.
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

  async function submit() {
    if (!description.trim()) return;
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
        // TODO: open the credit paywall. Products are defined in src/billing/products.ts.
        setError(`Out of credits — ${e.detail?.available ?? 0} left.`);
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
          // SCAFFOLD RESULT VIEW — the diagram goes above the parts list.
          <View style={styles.result} testID="generate-result">
            <Text style={styles.circuitTitle}>{result.title}</Text>
            <Text style={styles.resultBody}>{result.summary}</Text>

            <View style={styles.diagramPlaceholder}>
              <Ionicons name="git-network-outline" size={26} color={colors.onSurfaceTertiary} />
              <Text style={styles.placeholderText}>
                Diagram renderer not built yet — {result.components.length} components,{" "}
                {result.nets.length} nets
              </Text>
            </View>

            <Text style={styles.resultHeading}>Parts</Text>
            {result.parts_list.map((p, i) => (
              <Text key={i} style={styles.partLine}>
                {p.quantity}× {p.part}
                {p.designators.length ? `  (${p.designators.join(", ")})` : ""}
              </Text>
            ))}

            <Text style={styles.resultHeading}>Wiring</Text>
            {result.wiring_steps.map((s) => (
              <Text key={s.step} style={styles.resultBody}>
                {s.step}. {s.instruction}
              </Text>
            ))}

            {result.cautions.length > 0 && (
              <>
                <Text style={[styles.resultHeading, { color: colors.warning }]}>Take care</Text>
                {result.cautions.map((c, i) => (
                  <Text key={i} style={[styles.resultBody, { color: colors.warning }]}>
                    • {c}
                  </Text>
                ))}
              </>
            )}
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
  result: { marginTop: spacing.xl, gap: spacing.sm },
  circuitTitle: { fontFamily: fonts.sansBold, fontSize: type.xl, color: colors.onSurface },
  diagramPlaceholder: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing["2xl"],
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginTop: spacing.md,
  },
  placeholderText: {
    fontFamily: fonts.mono,
    fontSize: type.sm,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
  },
  resultHeading: {
    fontFamily: fonts.sansBold,
    fontSize: type.base,
    color: colors.brandTertiary,
    letterSpacing: 0.5,
    marginTop: spacing.lg,
  },
  resultBody: {
    fontFamily: fonts.sans,
    fontSize: type.base,
    lineHeight: 21,
    color: colors.onSurfaceSecondary,
  },
  partLine: { fontFamily: fonts.mono, fontSize: type.base, color: colors.onSurfaceSecondary },
});
