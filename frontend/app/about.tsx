import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DeleteAccountDialog } from "@/src/components/DeleteAccountDialog";
import { VioletSeedLabs } from "@/src/components/VioletSeedLabs";
import { useAuth } from "@/src/context/AuthContext";
import { ACCOUNT_DELETION_URL, PRIVACY_POLICY_URL, SUPPORT_EMAIL } from "@/src/links";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

/**
 * About, and the home for everything the stores require to be findable: the
 * privacy policy, the account-deletion route, and support contact.
 *
 * The deletion control lives here rather than buried in a settings tree because
 * a reviewer has to be able to find it, and `docs/data-deletion.html` tells
 * people the path is About → Delete my account. Those two must agree.
 */
export default function About() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const version = Constants.expoConfig?.version ?? "0.1.0";

  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      // A missing browser or a malformed URL shouldn't throw an unhandled
      // rejection; there is nothing useful to tell the user beyond the tap
      // not working.
    });
  };

  const onDeleted = async () => {
    setDeleting(false);
    // The account is gone, so `/auth/logout` will 401 — signOut clears the
    // local token regardless, which is the part that matters here.
    await signOut();
    router.replace("/login");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="about-screen">
      <DeleteAccountDialog
        visible={deleting}
        onClose={() => setDeleting(false)}
        onDeleted={onDeleted}
      />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurfaceSecondary} />
        </Pressable>
        <Text style={styles.title}>About</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.brand}>Trace</Text>
        <Text style={styles.version}>Version {version}</Text>

        <Text style={styles.copy}>
          Trace reads your board and your symptom and tells you what to measure next. It is
          a second opinion at the bench, not an authority — it says plainly what a
          photograph cannot settle, and every diagnosis carries its own confidence.
        </Text>

        <View style={styles.card}>
          <Row
            icon="shield-checkmark-outline"
            label="Privacy policy"
            onPress={() => openLink(PRIVACY_POLICY_URL)}
          />
          <Row
            icon="document-text-outline"
            label="How to delete your data"
            onPress={() => openLink(ACCOUNT_DELETION_URL)}
          />
          {!!SUPPORT_EMAIL && (
            <Row
              icon="mail-outline"
              label="Contact support"
              onPress={() => openLink(`mailto:${SUPPORT_EMAIL}`)}
            />
          )}
        </View>

        {!!user && (
          <View style={styles.card}>
            <Text style={styles.account} numberOfLines={1}>
              Signed in as {user.email}
            </Text>
            <Row
              icon="trash-outline"
              label="Delete my account"
              tone="destructive"
              onPress={() => setDeleting(true)}
              testID="about-delete-account"
              last
            />
          </View>
        )}

        <View style={styles.footer}>
          <VioletSeedLabs variant="tagline" />
        </View>
      </ScrollView>
    </View>
  );
}

function Row({
  icon,
  label,
  onPress,
  tone = "default",
  testID,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: "default" | "destructive";
  testID?: string;
  last?: boolean;
}) {
  const color = tone === "destructive" ? colors.error : colors.onSurface;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowDivider,
        pressed && { backgroundColor: colors.surfaceTertiary },
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={tone === "destructive" ? colors.error : colors.brandTertiary}
      />
      <Text style={[styles.rowLabel, { color }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} />
    </Pressable>
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
  body: { paddingHorizontal: spacing.xl, paddingBottom: 80, alignItems: "stretch" },
  brand: {
    fontFamily: fonts.sansBold,
    fontSize: type.display,
    color: colors.onSurface,
    letterSpacing: 2,
    marginTop: spacing.lg,
    textAlign: "center",
  },
  version: {
    fontFamily: fonts.mono,
    fontSize: type.sm,
    color: colors.onSurfaceTertiary,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  copy: {
    fontFamily: fonts.sans,
    fontSize: type.base,
    lineHeight: 22,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    marginTop: spacing.xl,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginTop: spacing.xl,
    overflow: "hidden",
  },
  account: {
    fontFamily: fonts.mono,
    fontSize: type.sm,
    color: colors.onSurfaceTertiary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowLabel: { flex: 1, fontFamily: fonts.sansMedium, fontSize: type.base },
  footer: { marginTop: spacing["3xl"], alignItems: "center" },
});
