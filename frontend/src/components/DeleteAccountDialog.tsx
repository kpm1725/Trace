/**
 * Permanent account deletion — required by both stores for any app that creates
 * accounts.
 *
 * This is the only irreversible action in the app, so it is deliberately not a
 * single tap. It names what goes, requires the word DELETE to be typed, and
 * separately warns that deleting the account does **not** cancel a
 * subscription. That last one is the warning that actually costs people money:
 * someone who assumes otherwise keeps being billed for an account that no
 * longer exists, and neither store will refund it on our say-so.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ApiError, apiFetch } from "@/src/api/client";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

const CONFIRM_WORD = "DELETE";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called once the account is gone, so the caller can clear local session state. */
  onDeleted: () => void;
};

export function DeleteAccountDialog({ visible, onClose, onDeleted }: Props) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;

  const close = () => {
    if (busy) return; // never close mid-delete; the caller would lose the outcome
    setTyped("");
    setError(null);
    onClose();
  };

  const handleDelete = async () => {
    if (!armed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/auth/account", { method: "DELETE" });
      setTyped("");
      onDeleted();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? "Your session expired. Sign in again and retry."
          : "Couldn't delete your account. Try again shortly.",
      );
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={styles.sheet} testID="delete-account-dialog">
        <View style={styles.grabber} />
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.eyebrow}>PERMANENT</Text>
          <Text style={styles.title}>Delete your account</Text>
          <Text style={styles.body}>
            This removes your account and everything stored with it — every saved
            diagnosis and generated circuit, and your credit balance. It cannot be undone.
          </Text>

          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              An active subscription is not cancelled by deleting your account. Cancel it
              in your Google Play or App Store account first, or you will keep being
              billed.
            </Text>
          </View>

          <Text style={styles.label}>Type {CONFIRM_WORD} to confirm</Text>
          <TextInput
            testID="delete-account-confirm-input"
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            placeholder={CONFIRM_WORD}
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
          />

          {!!error && (
            <Text style={styles.error} testID="delete-account-error">
              {error}
            </Text>
          )}

          <Pressable
            testID="delete-account-confirm-button"
            onPress={handleDelete}
            disabled={!armed || busy}
            style={[styles.destructive, (!armed || busy) && styles.destructiveDisabled]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <Text style={styles.destructiveText}>Delete my account</Text>
            )}
          </Pressable>

          <Pressable onPress={close} disabled={busy} style={styles.cancel}>
            <Text style={styles.cancelText}>Keep my account</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(10,6,20,0.7)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "88%",
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.error,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: type["2xl"],
    color: colors.onSurface,
    marginTop: spacing.xs,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: type.base,
    lineHeight: 21,
    color: colors.onSurfaceSecondary,
    marginTop: spacing.sm,
  },
  notice: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: colors.warning,
  },
  noticeText: {
    fontFamily: fonts.sans,
    fontSize: type.sm,
    lineHeight: 19,
    color: colors.onSurfaceSecondary,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: type.sm,
    letterSpacing: 1,
    color: colors.onSurfaceTertiary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontFamily: fonts.mono,
    fontSize: type.lg,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  error: {
    fontFamily: fonts.sans,
    fontSize: type.sm,
    color: colors.error,
    marginTop: spacing.sm,
  },
  destructive: {
    marginTop: spacing.lg,
    backgroundColor: colors.error,
    paddingVertical: 16,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  destructiveDisabled: { opacity: 0.4 },
  destructiveText: {
    fontFamily: fonts.sansMedium,
    fontSize: type.lg,
    color: colors.onSurfaceInverse,
  },
  cancel: { alignSelf: "center", padding: spacing.md, marginTop: spacing.xs },
  cancelText: {
    fontFamily: fonts.sansMedium,
    fontSize: type.base,
    color: colors.onSurfaceTertiary,
  },
});
