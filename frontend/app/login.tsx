import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";

import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts, spacing, radius, gradient } from "@/src/theme";

export default function Login() {
  const { signIn, loading } = useAuth();
  const [busy, setBusy] = useState(false);

  const handleSignIn = async () => {
    setBusy(true);
    try {
      await signIn();
    } catch (e) {
      console.warn(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient colors={gradient.brand} style={styles.root} testID="login-screen">
      <View style={styles.content}>
        <Text style={styles.eyebrow}>VIOLET SEED LABS</Text>
        <Text style={styles.title}>Trace the fault.</Text>
        <Text style={styles.subtitle}>
          Photograph a breadboard or describe a circuit — get AI-diagnosed fixes and generated wiring instructions.
        </Text>

        <Pressable
          testID="login-google-button"
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          onPress={handleSignIn}
          disabled={busy || loading}
        >
          {busy ? (
            <ActivityIndicator color={colors.onSurfaceInverse} />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color={colors.onSurfaceInverse} />
              <Text style={styles.ctaText}>Continue with Google</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.fineprint}>Built to grow — By continuing you agree to our terms of use.</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: "flex-end",
    padding: spacing.xl,
    paddingBottom: spacing["3xl"],
    gap: spacing.md,
  },
  eyebrow: {
    fontFamily: fonts.sansBold,
    fontWeight: "700",
    color: colors.brandAccent,
    letterSpacing: 4,
    fontSize: 12,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontWeight: "700",
    color: colors.onSurfaceInverse,
    fontSize: 40,
    lineHeight: 44,
  },
  subtitle: {
    fontFamily: fonts.sans,
    color: "rgba(250,249,251,0.85)",
    fontSize: 17,
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  cta: {
    backgroundColor: colors.surfaceInverse,
    paddingVertical: 16,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  ctaText: {
    fontFamily: fonts.sansMedium,
    fontWeight: "600",
    fontSize: 16,
    color: colors.onSurfaceInverse,
  },
  fineprint: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: "rgba(250,249,251,0.6)",
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
