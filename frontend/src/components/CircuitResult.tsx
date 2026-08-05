import { View, Text, StyleSheet } from "react-native";
import { colors, fonts, radius, spacing, type } from "@/src/theme";

export type CircuitResultData = {
  parse_error?: boolean;
  raw_text?: string;
  components?: { id: string; type: string; label: string }[];
  nodes?: { id: string; label: string }[];
  connections?: { from: string; to: string; label?: string }[];
  parts_list?: { name: string; value: string; qty: number; notes?: string }[];
  wiring_steps?: string[];
};

// Renders Claude's structured circuit JSON as readable lists — not a wired
// schematic layout. A real SVG diagram renderer (component positions + wires)
// is a good follow-up; this proves the structured-data pipeline end to end.
export default function CircuitResult({ result }: { result: CircuitResultData }) {
  if (result.parse_error) {
    return (
      <View style={styles.raw}>
        <Text style={styles.rawLabel}>Couldn't parse a structured response — raw output:</Text>
        <Text style={styles.rawText}>{result.raw_text}</Text>
      </View>
    );
  }

  const labelFor = (id: string) =>
    result.components?.find((c) => c.id === id)?.label ??
    result.nodes?.find((n) => n.id === id)?.label ??
    id;

  return (
    <View>
      {!!result.components?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Components</Text>
          {result.components.map((c) => (
            <Text key={c.id} style={styles.line}>• {c.label} <Text style={styles.dim}>({c.type})</Text></Text>
          ))}
        </View>
      )}

      {!!result.connections?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connections</Text>
          {result.connections.map((c, i) => (
            <Text key={i} style={styles.line}>
              • {labelFor(c.from)} → {labelFor(c.to)}{c.label ? ` (${c.label})` : ""}
            </Text>
          ))}
        </View>
      )}

      {!!result.parts_list?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Parts list</Text>
          {result.parts_list.map((p, i) => (
            <Text key={i} style={styles.line}>
              • {p.qty}× {p.name} {p.value ? `— ${p.value}` : ""}{p.notes ? ` (${p.notes})` : ""}
            </Text>
          ))}
        </View>
      )}

      {!!result.wiring_steps?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wiring steps</Text>
          {result.wiring_steps.map((step, i) => (
            <Text key={i} style={styles.line}>{i + 1}. {step}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontFamily: fonts.sansBold, fontWeight: "700", color: colors.onBackground, fontSize: type.lg, marginBottom: spacing.xs },
  line: { fontFamily: fonts.sans, color: colors.onSurfaceSecondary, fontSize: type.base, marginBottom: spacing.xs, lineHeight: 20 },
  dim: { color: colors.onSurfaceTertiary },
  raw: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  rawLabel: { fontFamily: fonts.sansMedium, fontWeight: "600", color: colors.warning, marginBottom: spacing.xs },
  rawText: { fontFamily: fonts.mono, color: colors.onSurfaceSecondary, fontSize: type.sm },
});
