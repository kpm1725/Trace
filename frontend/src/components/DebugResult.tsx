import { View, Text, StyleSheet } from "react-native";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

export type DebugResultData = {
  parse_error?: boolean;
  raw_text?: string;
  likely_causes?: { cause: string; confidence: "high" | "medium" | "low"; reasoning: string }[];
  fix_steps?: string[];
  confidence_note?: string;
};

const CONFIDENCE_COLOR: Record<string, string> = {
  high: colors.success,
  medium: colors.warning,
  low: colors.error,
};

export default function DebugResult({ result }: { result: DebugResultData }) {
  if (result.parse_error) {
    return (
      <View style={styles.raw}>
        <Text style={styles.rawLabel}>Couldn't parse a structured response — raw output:</Text>
        <Text style={styles.rawText}>{result.raw_text}</Text>
      </View>
    );
  }

  return (
    <View>
      {(result.likely_causes || []).map((c, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{i + 1}. {c.cause}</Text>
            <View style={[styles.badge, { backgroundColor: CONFIDENCE_COLOR[c.confidence] || colors.info }]}>
              <Text style={styles.badgeText}>{c.confidence}</Text>
            </View>
          </View>
          <Text style={styles.cardBody}>{c.reasoning}</Text>
        </View>
      ))}

      {!!result.fix_steps?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Suggested fix</Text>
          {result.fix_steps.map((step, i) => (
            <Text key={i} style={styles.step}>{i + 1}. {step}</Text>
          ))}
        </View>
      )}

      {!!result.confidence_note && (
        <View style={styles.noteBox}>
          <Text style={styles.noteText}>{result.confidence_note}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  cardTitle: { fontFamily: fonts.sansMedium, fontWeight: "600", color: colors.onSurface, fontSize: type.base, flex: 1, marginRight: spacing.sm },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { fontFamily: fonts.sansBold, fontWeight: "700", fontSize: 10, color: colors.onSurfaceInverse, textTransform: "uppercase" },
  cardBody: { fontFamily: fonts.sans, color: colors.onSurfaceSecondary, fontSize: type.sm, lineHeight: 19 },
  section: { marginTop: spacing.md },
  sectionTitle: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.onBackground, fontSize: type.lg, marginBottom: spacing.xs },
  step: { fontFamily: fonts.sans, color: colors.onSurfaceSecondary, fontSize: type.base, marginBottom: spacing.xs, lineHeight: 20 },
  noteBox: { marginTop: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md },
  noteText: { fontFamily: fonts.sans, color: colors.onSurfaceTertiary, fontStyle: "italic", fontSize: type.sm },
  raw: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  rawLabel: { fontFamily: fonts.sansMedium, fontWeight: "600", color: colors.warning, marginBottom: spacing.xs },
  rawText: { fontFamily: fonts.mono, color: colors.onSurfaceSecondary, fontSize: type.sm },
});
