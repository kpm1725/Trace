import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";

import { useAuth } from "@/src/context/AuthContext";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

export default function About() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="about-screen">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>ABOUT</Text>
        <Text style={styles.title}>Trace</Text>
      </View>

      {user ? <Text style={styles.meta}>Signed in as {user.email}</Text> : null}
      <Text style={styles.meta}>Version {Constants.expoConfig?.version ?? "1.0.0"}</Text>

      <View style={styles.credit}>
        <Text style={styles.creditLabel}>Made by</Text>
        <Text style={styles.creditName}>Violet Seed Labs</Text>
        <Text style={styles.creditTagline}>Built to grow</Text>
      </View>

      <Pressable testID="about-signout-button" style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { marginBottom: spacing.lg },
  eyebrow: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.brandAccent, letterSpacing: 3, fontSize: type.sm },
  title: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.onBackground, fontSize: type["2xl"], marginTop: spacing.xs },
  meta: { fontFamily: fonts.sans, color: colors.onSurfaceSecondary, marginBottom: spacing.xs },
  credit: { marginTop: spacing["2xl"], marginBottom: spacing["2xl"] },
  creditLabel: { fontFamily: fonts.sans, color: colors.onSurfaceTertiary, fontSize: type.sm },
  creditName: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.brandAccent, fontSize: type.xl, marginTop: 2 },
  creditTagline: { fontFamily: fonts.sans, color: colors.onSurfaceSecondary, fontStyle: "italic", marginTop: 2 },
  signOut: {
    marginTop: "auto", marginBottom: spacing.xl, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, paddingVertical: 14, alignItems: "center",
  },
  signOutText: { fontFamily: fonts.sansMedium, fontWeight: "600", color: colors.onSurface },
});
