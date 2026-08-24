/**
 * Saved session detail.
 *
 * Renders whichever result the record holds, using the same two components the
 * live screens use. `kind` discriminates the union in `src/types.ts`, so
 * TypeScript narrows `session.result` to `Diagnosis` or `Circuit` and neither
 * branch needs a cast.
 *
 * The original prompt is shown above the result, which the live screens don't
 * do — there the user just typed it. Reopening a session weeks later, "what did
 * I actually ask?" is the first question.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiFetch } from "@/src/api/client";
import { CircuitResult } from "@/src/components/CircuitResult";
import { DiagnosisResult } from "@/src/components/DiagnosisResult";
import { Body, Callout } from "@/src/components/ui";
import { colors, fonts, radius, spacing, type } from "@/src/theme";
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

  const confirmDelete = useCallback(() => {
    Alert.alert("Delete this session?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await apiFetch(`/sessions/${id}`, { method: "DELETE" });
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't delete that session.");
          }
        },
      },
    ]);
  }, [id, router]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="session-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurfaceSecondary} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {session?.title ?? "Session"}
        </Text>
        {session ? (
          <Pressable testID="session-delete-button" onPress={confirmDelete} hitSlop={10}>
            <Ionicons name="trash-outline" size={20} color={colors.onSurfaceTertiary} />
          </Pressable>
        ) : (
          <View style={{ width: 20 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 60 }} />
        ) : error ? (
          <Callout tone="warning" title="Couldn't load" items={[error]} testID="session-error" />
        ) : session ? (
          <>
            <Text style={styles.kind}>
              {session.kind === "debug" ? "DIAGNOSIS" : "CIRCUIT"} ·{" "}
              {new Date(session.created_at).toLocaleString()}
            </Text>

            <View style={styles.prompt}>
              {session.kind === "debug" ? (
                <>
                  <Text style={styles.promptLabel}>Symptom</Text>
                  <Body style={{ color: colors.onSurface }}>{session.prompt.symptom}</Body>
                  {!!session.prompt.context && (
                    <>
                      <Text style={[styles.promptLabel, { marginTop: spacing.md }]}>
                        Already tried
                      </Text>
                      <Body>{session.prompt.context}</Body>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.promptLabel}>Asked for</Text>
                  <Body style={{ color: colors.onSurface }}>{session.prompt.description}</Body>
                </>
              )}
            </View>

            {session.kind === "debug" ? (
              <DiagnosisResult diagnosis={session.result} />
            ) : (
              <CircuitResult circuit={session.result} />
            )}
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
  title: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: type.lg,
    color: colors.onSurface,
    textAlign: "center",
  },
  body: { paddingHorizontal: spacing.xl, paddingBottom: 80 },
  kind: {
    fontFamily: fonts.mono,
    fontSize: type.sm,
    color: colors.onSurfaceTertiary,
    letterSpacing: 1,
  },
  prompt: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  promptLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: type.sm,
    color: colors.onSurfaceTertiary,
    letterSpacing: 0.5,
  },
});
