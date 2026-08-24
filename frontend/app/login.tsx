import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { VioletSeedLabs } from "@/src/components/VioletSeedLabs";
import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts, gradient, radius, spacing, type } from "@/src/theme";

export default function Login() {
  const insets = useSafeAreaInsets();
  const { user, loading, error, signIn } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }
  if (user) return <Redirect href="/home" />;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.hero}>
        <Text style={styles.brand}>Trace</Text>
        <Text style={styles.tagline}>Find the fault. Build the fix.</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          testID="login-google-button"
          onPress={signIn}
          style={({ pressed }) => [styles.buttonWrap, pressed && { opacity: 0.85 }]}
        >
          <LinearGradient
            colors={[...gradient.brand]}
            start={gradient.start}
            end={gradient.end}
            style={styles.button}
          >
            <Ionicons name="logo-google" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.buttonText}>Continue with Google</Text>
          </LinearGradient>
        </Pressable>

        {!!error && (
          <Text style={styles.error} testID="login-error">
            {error}
          </Text>
        )}

        <VioletSeedLabs variant="byline" style={{ marginTop: spacing["2xl"] }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, justifyContent: "space-between" },
  center: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  brand: {
    fontFamily: fonts.sansBold,
    fontSize: type.hero,
    color: colors.onSurface,
    letterSpacing: 2,
  },
  tagline: {
    fontFamily: fonts.sans,
    fontSize: type.lg,
    color: colors.onSurfaceTertiary,
    marginTop: spacing.md,
  },
  actions: { paddingHorizontal: spacing.xl, paddingBottom: spacing["2xl"] },
  buttonWrap: { borderRadius: radius.pill, overflow: "hidden" },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  buttonText: {
    fontFamily: fonts.sansMedium,
    fontSize: type.lg,
    color: colors.onBrandPrimary,
  },
  error: {
    fontFamily: fonts.sans,
    fontSize: type.base,
    color: colors.error,
    textAlign: "center",
    marginTop: spacing.lg,
  },
});
