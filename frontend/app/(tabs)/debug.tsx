import { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Alert, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiFetchForm, ApiError } from "@/src/api/client";
import { useBilling } from "@/src/context/BillingContext";
import Paywall from "@/src/components/Paywall";
import DebugResult, { DebugResultData } from "@/src/components/DebugResult";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

export default function Debug() {
  const insets = useSafeAreaInsets();
  const { entitlement, refresh } = useBilling();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [symptom, setSymptom] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DebugResultData | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);

  const pickImage = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Trace needs access to your camera/photos to debug a circuit.");
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!result.canceled && result.assets?.[0]) {
      setImageUri(result.assets[0].uri);
      setResult(null);
    }
  };

  const analyze = async () => {
    if (!imageUri) {
      Alert.alert("Add a photo", "Take or upload a photo of the circuit first.");
      return;
    }
    if (!symptom.trim()) {
      Alert.alert("Describe the symptom", "A short description helps Trace narrow down the cause.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("symptom", symptom.trim());
      form.append("file", { uri: imageUri, name: "circuit.jpg", type: "image/jpeg" } as any);
      const data = await apiFetchForm<{ session: { result: DebugResultData } }>("/debug/photo", form);
      setResult(data.session.result);
    } catch (e) {
      if (e instanceof ApiError && e.status === 402) {
        setShowPaywall(true);
      } else {
        Alert.alert("Analysis failed", e instanceof Error ? e.message : "Something went wrong.");
      }
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <ScrollView style={[styles.root, { paddingTop: insets.top }]} testID="debug-screen">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>DEBUG FROM PHOTO</Text>
          <Text style={styles.title}>What's wrong with this circuit?</Text>
        </View>
        {entitlement && (
          <Text style={styles.credits}>{entitlement.is_unlimited ? "∞" : entitlement.total_available} credits</Text>
        )}
      </View>

      <View style={styles.imageBox}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} contentFit="cover" />
        ) : (
          <Ionicons name="hardware-chip-outline" size={40} color={colors.onSurfaceTertiary} />
        )}
      </View>

      <View style={styles.row}>
        <Pressable testID="debug-camera-button" style={styles.actionBtn} onPress={() => pickImage(true)}>
          <Ionicons name="camera-outline" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.actionBtnText}>Camera</Text>
        </Pressable>
        <Pressable testID="debug-library-button" style={styles.actionBtnSecondary} onPress={() => pickImage(false)}>
          <Ionicons name="images-outline" size={18} color={colors.onSurface} />
          <Text style={styles.actionBtnSecondaryText}>Upload</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Symptom</Text>
      <TextInput
        testID="debug-symptom-input"
        style={styles.input}
        placeholder="e.g. LED won't light, motor stutters intermittently"
        placeholderTextColor={colors.onSurfaceTertiary}
        value={symptom}
        onChangeText={setSymptom}
        multiline
      />

      <Pressable testID="debug-analyze-button" style={styles.cta} onPress={analyze} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Analyze</Text>}
      </Pressable>

      {result && (
        <View style={styles.resultsBox}>
          <DebugResult result={result} />
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
  imageBox: {
    height: 200,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  image: { width: "100%", height: "100%" },
  row: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  actionBtn: {
    flex: 1, flexDirection: "row", gap: spacing.xs, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.brandPrimary, paddingVertical: 12, borderRadius: radius.md,
  },
  actionBtnText: { fontFamily: fonts.sansMedium, fontWeight: "600", color: colors.onBrandPrimary },
  actionBtnSecondary: {
    flex: 1, flexDirection: "row", gap: spacing.xs, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface, paddingVertical: 12, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  actionBtnSecondaryText: { fontFamily: fonts.sansMedium, fontWeight: "600", color: colors.onSurface },
  label: { fontFamily: fonts.sansMedium, fontWeight: "600", color: colors.onSurfaceSecondary, marginBottom: spacing.xs },
  input: {
    minHeight: 80, borderRadius: radius.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, color: colors.onSurface,
    padding: spacing.md, textAlignVertical: "top", marginBottom: spacing.lg,
  },
  cta: { backgroundColor: colors.brandPrimary, paddingVertical: 16, borderRadius: radius.pill, alignItems: "center", marginBottom: spacing.lg },
  ctaText: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.onBrandPrimary, fontSize: type.lg },
  resultsBox: { marginBottom: spacing.xl },
});
