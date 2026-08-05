import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiFetch } from "@/src/api/client";
import DebugResult from "@/src/components/DebugResult";
import CircuitResult from "@/src/components/CircuitResult";
import { colors, fonts, spacing, type } from "@/src/theme";

type SessionDoc = {
  session_id: string;
  type: "debug" | "generate";
  symptom?: string;
  description?: string;
  result: any;
  created_at: string;
};

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<{ session: SessionDoc }>(`/sessions/${id}`);
        setSession(data.session);
      } catch (e) {
        console.warn(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="session-detail-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {session ? (session.type === "debug" ? session.symptom : session.description) : "Session"}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brandAccent} style={{ marginTop: spacing.xl }} />
      ) : !session ? (
        <Text style={styles.error}>Session not found.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          {session.type === "debug" ? (
            <DebugResult result={session.result} />
          ) : (
            <CircuitResult result={session.result} />
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.sm },
  back: { padding: spacing.xs },
  title: { flex: 1, fontFamily: fonts.sansBold, fontWeight: "700", color: colors.onBackground, fontSize: type.lg },
  error: { fontFamily: fonts.sans, color: colors.onSurfaceTertiary, textAlign: "center", marginTop: spacing.xl },
});
