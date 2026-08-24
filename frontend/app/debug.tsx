/**
 * Debug from photo.
 *
 * Owns capture, resize/encode, the symptom form, and the call. The result is
 * rendered by `<DiagnosisResult>`, shared with `session/[id].tsx` so a
 * diagnosis looks the same whether it was just produced or reopened later.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, apiFetch } from "@/src/api/client";
import { DiagnosisResult } from "@/src/components/DiagnosisResult";
import { Paywall } from "@/src/components/Paywall";
import { colors, fonts, gradient, radius, spacing, type } from "@/src/theme";
import { Diagnosis, TraceSession } from "@/src/types";

// The API accepts up to ~5MB of base64 per image, and a modern phone photo
// clears that on its own. Resizing before encoding also cuts upload time on a
// workshop's wifi, which is where this app gets used.
const MAX_EDGE = 1568;
const JPEG_QUALITY = 0.8;

export default function DebugFromPhoto() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [symptom, setSymptom] = useState("");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [paywall, setPaywall] = useState<string | null>(null);

  async function prepare(uri: string) {
    // Resize on the longest edge and re-encode as JPEG. `base64: true` avoids a
    // second read of the file off disk just to encode it.
    const manipulation = ImageManipulator.manipulate(uri).resize({ width: MAX_EDGE });
    const image = await manipulation.renderAsync();
    const out = await image.saveAsync({
      compress: JPEG_QUALITY,
      format: SaveFormat.JPEG,
      base64: true,
    });
    setImageUri(out.uri);
    setImageBase64(out.base64 ?? null);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("Camera access is needed to photograph the board.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (!res.canceled) await prepare(res.assets[0].uri);
  }

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    if (!res.canceled) await prepare(res.assets[0].uri);
  }

  async function submit() {
    if (!imageBase64 || !symptom.trim()) return;
    setPaywall(null);
    setBusy(true);
    setError(null);
    try {
      const { session } = await apiFetch<{ session: TraceSession }>("/debug", {
        method: "POST",
        body: {
          image_base64: imageBase64,
          media_type: "image/jpeg",
          symptom: symptom.trim(),
          context: context.trim(),
        },
      });
      setResult(session.result as Diagnosis);
    } catch (e) {
      if (e instanceof ApiError && e.isPaywall) {
        const needed = e.detail?.needed ?? 1;
        const available = e.detail?.available ?? 0;
        setPaywall(
          `A diagnosis costs ${needed} credit${needed === 1 ? "" : "s"} and you have ${available}.`,
        );
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = !!imageBase64 && symptom.trim().length > 0 && !busy;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="debug-screen">
      {/* Mounted only once needed. The paywall configures the RevenueCat SDK
          and fetches offerings on mount, and most people never see it — that
          is store network work not worth doing on every visit to this screen. */}
      {paywall !== null && (
        <Paywall
          visible
          reason={paywall}
          onClose={() => setPaywall(null)}
          // Credited means the refused call can now succeed, so run it rather
          // than making the user tap Diagnose again after paying.
          onCredited={submit}
        />
      )}

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurfaceSecondary} />
        </Pressable>
        <Text style={styles.title}>Debug from photo</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {imageUri ? (
          <Pressable onPress={pickPhoto} style={styles.previewWrap}>
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
            <Text style={styles.replace}>Tap to replace</Text>
          </Pressable>
        ) : (
          <View style={styles.pickRow}>
            <Pressable testID="debug-camera-button" onPress={takePhoto} style={styles.pickButton}>
              <Ionicons name="camera-outline" size={26} color={colors.brandTertiary} />
              <Text style={styles.pickText}>Take photo</Text>
            </Pressable>
            <Pressable testID="debug-library-button" onPress={pickPhoto} style={styles.pickButton}>
              <Ionicons name="images-outline" size={26} color={colors.brandTertiary} />
              <Text style={styles.pickText}>Choose photo</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.label}>What is it doing?</Text>
        <TextInput
          testID="debug-symptom-input"
          value={symptom}
          onChangeText={setSymptom}
          placeholder="LED won't light / motor stutters intermittently"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.input}
          multiline
        />

        <Text style={styles.label}>Anything you&apos;ve already tried? (optional)</Text>
        <TextInput
          testID="debug-context-input"
          value={context}
          onChangeText={setContext}
          placeholder="Swapped the LED, checked the battery with a meter — 8.9V"
          placeholderTextColor={colors.onSurfaceTertiary}
          style={[styles.input, { minHeight: 72 }]}
          multiline
        />

        <Pressable
          testID="debug-submit-button"
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
              <Text style={styles.submitText}>Diagnose</Text>
            )}
          </LinearGradient>
        </Pressable>

        {!!error && (
          <Text style={styles.error} testID="debug-error">
            {error}
          </Text>
        )}

        {result && (
          <View style={styles.result} testID="debug-result">
            <DiagnosisResult diagnosis={result} />
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
  pickRow: { flexDirection: "row", gap: spacing.md },
  pickButton: {
    flex: 1,
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing["2xl"],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderStyle: "dashed",
  },
  pickText: { fontFamily: fonts.sansMedium, fontSize: type.base, color: colors.onSurfaceSecondary },
  previewWrap: { borderRadius: radius.lg, overflow: "hidden" },
  preview: { width: "100%", height: 220, backgroundColor: colors.surfaceSecondary },
  replace: {
    fontFamily: fonts.sans,
    fontSize: type.sm,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
    paddingVertical: spacing.sm,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: type.sm,
    color: colors.onSurfaceTertiary,
    letterSpacing: 0.5,
    marginTop: spacing.md,
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: type.lg,
    color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    minHeight: 96,
    textAlignVertical: "top",
  },
  submitWrap: { borderRadius: radius.pill, overflow: "hidden", marginTop: spacing.lg },
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
