import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiFetch } from "@/src/api/client";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

type SessionLite = {
  session_id: string;
  type: "debug" | "generate";
  title: string;
  created_at: string;
};

export default function History() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<SessionLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ sessions: SessionLite[] }>("/sessions");
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
        <Text style={styles.eyebrow}>PROJECT HISTORY</Text>
        <Text style={styles.title}>Past sessions</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brandAccent} style={{ marginTop: spacing.xl }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="folder-open-outline" size={36} color={colors.onSurfaceTertiary} />
          <Text style={styles.emptyText}>Your debug sessions and generated circuits will show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => s.session_id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandAccent} />}
          renderItem={({ item }) => (
            <Pressable
              testID={`history-item-${item.session_id}`}
              style={styles.card}
              onPress={() => router.push(`/session/${item.session_id}`)}
            >
              <Ionicons
                name={item.type === "debug" ? "camera-outline" : "flash-outline"}
                size={20}
                color={colors.brandAccent}
              />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title || "Untitled"}</Text>
                <Text style={styles.cardMeta}>{item.type === "debug" ? "Debug" : "Generate"} · {new Date(item.created_at).toLocaleDateString()}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { marginBottom: spacing.lg },
  eyebrow: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.brandAccent, letterSpacing: 3, fontSize: type.sm },
  title: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.onBackground, fontSize: type["2xl"], marginTop: spacing.xs },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyText: { fontFamily: fonts.sans, color: colors.onSurfaceTertiary, textAlign: "center" },
  card: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  cardTitle: { fontFamily: fonts.sansMedium, fontWeight: "600", color: colors.onSurface, fontSize: type.base },
  cardMeta: { fontFamily: fonts.sans, color: colors.onSurfaceTertiary, fontSize: type.sm, marginTop: 2 },
});
