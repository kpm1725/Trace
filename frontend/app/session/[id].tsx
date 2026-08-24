/**
 * Saved session detail — SCAFFOLD.
 *
 * Loads and shapes the record. The rendered views are the same two that
 * `debug.tsx` and `generate.tsx` show inline, so all three should share one
 * `<Diagnosis>` and one `<CircuitResult>` component once those are designed —
 * building them here first would mean writing them twice.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiFetch } from "@/src/api/client";
import { colors, fonts, spacing, type } from "@/src/theme";
import { TraceSession } from "@/src/types";

export default function SessionDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [session, setSession] = useState<TraceSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<{ session: TraceSession }>(`/sessions/${id}`);
        setSession(data.session);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load that session.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="session-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurfaceSecondary} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {session?.title ?? "Session"}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 60 }} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : session ? (
          <>
            <Text style={styles.kind}>
              {session.kind === "debug" ? "DIAGNOSIS" : "CIRCUIT"} ·{" "}
              {new Date(session.created_at).toLocaleString()}
            </Text>
            {session.kind === "debug" ? (
              <Text style={styles.body_text}>{session.result.observation}</Text>
            ) : (
              <Text style={styles.body_text}>{session.result.summary}</Text>
            )}
            <Text style={styles.todo}>
              Full result view lands with the shared diagnosis and circuit components.
            </Text>
          </>
        ) : null}
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
    gap: spacing.md,
  },
  title: { flex: 1, fontFamily: fonts.sansMedium, fontSize: type.lg, color: colors.onSurface, textAlign: "center" },
  body: { paddingHorizontal: spacing.xl, paddingBottom: 80, gap: spacing.md },
  kind: { fontFamily: fonts.mono, fontSize: type.sm, color: colors.onSurfaceTertiary, letterSpacing: 1 },
  body_text: {
    fontFamily: fonts.sans,
    fontSize: type.base,
    lineHeight: 21,
    color: colors.onSurfaceSecondary,
  },
  todo: {
    fontFamily: fonts.mono,
    fontSize: type.sm,
    color: colors.onSurfaceTertiary,
    marginTop: spacing.xl,
  },
  error: { fontFamily: fonts.sans, fontSize: type.base, color: colors.error },
});
