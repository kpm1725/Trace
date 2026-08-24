import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiFetch } from "@/src/api/client";
import { colors, fonts, radius, spacing, type } from "@/src/theme";
import { SessionSummary } from "@/src/types";

/** Both kinds of work in one reverse-chronological list, same as Scribe's library. */
export default function History() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ sessions: SessionSummary[] }>("/sessions");
      setItems(data.sessions);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="history-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurfaceSecondary} />
        </Pressable>
        <Text style={styles.title}>History</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 60 }} />
        ) : items.length === 0 ? (
          <View style={styles.empty} testID="history-empty">
            <Ionicons name="hardware-chip-outline" size={42} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyTitle}>Nothing traced yet.</Text>
            <Text style={styles.emptySub}>
              Diagnose a board or generate a circuit, and it shows up here.
            </Text>
          </View>
        ) : (
          items.map((s) => (
            <Pressable
              key={s.session_id}
              testID={`history-row-${s.session_id}`}
              onPress={() => router.push(`/session/${s.session_id}`)}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.surfaceSecondary },
              ]}
            >
              <Ionicons
                name={s.kind === "debug" ? "camera-outline" : "git-network-outline"}
                size={20}
                color={colors.brandTertiary}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {s.title}
                </Text>
                <Text style={styles.rowMeta}>
                  {s.kind === "debug" ? "Diagnosis" : "Circuit"} ·{" "}
                  {new Date(s.created_at).toLocaleDateString()}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
            </Pressable>
          ))
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
  empty: { alignItems: "center", gap: spacing.md, paddingTop: 80, paddingHorizontal: spacing.xl },
  emptyTitle: { fontFamily: fonts.sansBold, fontSize: type.xl, color: colors.onSurface },
  emptySub: {
    fontFamily: fonts.sans,
    fontSize: type.base,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    borderRadius: radius.sm,
  },
  rowTitle: { fontFamily: fonts.sansMedium, fontSize: type.lg, color: colors.onSurface },
  rowMeta: {
    fontFamily: fonts.mono,
    fontSize: type.sm,
    color: colors.onSurfaceTertiary,
    marginTop: spacing.xs,
  },
});
