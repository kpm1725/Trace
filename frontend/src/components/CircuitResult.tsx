/**
 * The generated-circuit view. Shared by `app/generate.tsx` and
 * `app/session/[id].tsx`.
 *
 * The diagram is not built yet (see README, "Rendering the netlist"), so this
 * renders the netlist as a **connection list** rather than leaving a hole. That
 * is not a stand-in for the drawing — a connection list is how a netlist is
 * conventionally written down, and it is enough to actually build the circuit
 * from. When the renderer lands it goes above this, and this stays: a drawing
 * and its netlist answer different questions ("what is this?" vs "does R2 go to
 * pin 6 or pin 7?").
 */
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Body, Callout, Chip, Collapsible, Mono, SectionHeading } from "@/src/components/ui";
import { colors, fonts, radius, spacing, type } from "@/src/theme";
import { Circuit, CircuitComponent, Net } from "@/src/types";

const NET_ICON: Record<Net["kind"], keyof typeof Ionicons.glyphMap> = {
  power: "flash-outline",
  ground: "remove-outline",
  signal: "pulse-outline",
};

const NET_COLOR: Record<Net["kind"], string> = {
  power: colors.warning,
  ground: colors.onSurfaceTertiary,
  signal: colors.brandTertiary,
};

/** `R1.2`, `U1.TRIG` — the conventional way to name a pin on a net. */
function pinLabel(componentId: string, pin: string): string {
  return `${componentId}.${pin}`;
}

function NetRow({ net, byId }: { net: Net; byId: Map<string, CircuitComponent> }) {
  return (
    <View style={styles.netRow} testID={`net-${net.id}`}>
      <View style={styles.netHead}>
        <Ionicons name={NET_ICON[net.kind]} size={14} color={NET_COLOR[net.kind]} />
        <Text style={[styles.netName, { color: NET_COLOR[net.kind] }]}>{net.id}</Text>
      </View>
      <Mono style={styles.netPins}>
        {net.connections.map((c) => pinLabel(c.component_id, c.pin)).join("  —  ")}
      </Mono>
      <Text style={styles.netParts}>
        {net.connections
          .map((c) => byId.get(c.component_id)?.label)
          .filter((label, i, all): label is string => !!label && all.indexOf(label) === i)
          .join(", ")}
      </Text>
    </View>
  );
}

function ComponentRow({ component }: { component: CircuitComponent }) {
  return (
    <View style={styles.componentRow} testID={`component-${component.id}`}>
      <Text style={styles.componentId}>{component.id}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.componentLabel}>
          {component.label}
          {component.value ? <Text style={styles.componentValue}> · {component.value}</Text> : null}
        </Text>
        <Mono style={styles.componentPins}>{component.pins.join(" · ")}</Mono>
        {!!component.notes && <Body style={styles.componentNotes}>{component.notes}</Body>}
      </View>
    </View>
  );
}

export function CircuitResult({ circuit }: { circuit: Circuit }) {
  // Nets reference components by id; the connection list wants their labels.
  const byId = new Map(circuit.components.map((c) => [c.id, c]));

  return (
    <View testID="circuit-result">
      <Text style={styles.title}>{circuit.title}</Text>
      <View style={styles.supplyRow}>
        {/* `supply_voltage` is an empty string for circuits where it doesn't
            apply, so only that chip is conditional — the counts always show. */}
        {!!circuit.supply_voltage && <Chip label={circuit.supply_voltage} tone="brand" />}
        <Chip label={`${circuit.components.length} parts`} />
        <Chip label={`${circuit.nets.length} nets`} />
      </View>
      <Body style={{ marginTop: spacing.md }}>{circuit.summary}</Body>

      {circuit.cautions.length > 0 && (
        <Callout tone="warning" title="Take care" items={circuit.cautions} testID="circuit-cautions" />
      )}

      <View style={styles.diagramPlaceholder} testID="circuit-diagram-placeholder">
        <Ionicons name="git-network-outline" size={26} color={colors.onSurfaceTertiary} />
        <Text style={styles.placeholderText}>Diagram coming soon</Text>
        <Text style={styles.placeholderSub}>
          Every connection is listed below — the circuit is fully buildable from it.
        </Text>
      </View>

      {circuit.parts_list.length > 0 && <SectionHeading>Parts</SectionHeading>}
      {circuit.parts_list.map((part, i) => (
        <View key={i} style={styles.partRow} testID={`part-${i}`}>
          <Text style={styles.partQty}>{part.quantity}×</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.partName}>{part.part}</Text>
            {part.designators.length > 0 && (
              <Mono style={styles.partDesignators}>{part.designators.join(", ")}</Mono>
            )}
            {!!part.note && <Body style={styles.partNote}>{part.note}</Body>}
          </View>
        </View>
      ))}

      {circuit.wiring_steps.length > 0 && <SectionHeading>Wiring</SectionHeading>}
      {circuit.wiring_steps.map((step) => (
        <View key={step.step} style={styles.stepRow} testID={`step-${step.step}`}>
          <Text style={styles.stepNumber}>{step.step}</Text>
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Body style={{ color: colors.onSurface }}>{step.instruction}</Body>
            {step.involves.length > 0 && (
              <View style={styles.stepChips}>
                {step.involves.map((id) => (
                  <Chip key={id} label={id} />
                ))}
              </View>
            )}
          </View>
        </View>
      ))}

      <SectionHeading>Connections</SectionHeading>
      <Collapsible
        testID="circuit-nets"
        header={<Text style={styles.collapsibleLabel}>Netlist · {circuit.nets.length} nets</Text>}
      >
        {circuit.nets.map((net) => (
          <NetRow key={net.id} net={net} byId={byId} />
        ))}
      </Collapsible>

      <Collapsible
        testID="circuit-components"
        header={
          <Text style={styles.collapsibleLabel}>
            Pinouts · {circuit.components.length} components
          </Text>
        }
      >
        {circuit.components.map((component) => (
          <ComponentRow key={component.id} component={component} />
        ))}
      </Collapsible>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.sansBold, fontSize: type.xl, color: colors.onSurface },
  supplyRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },

  diagramPlaceholder: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing["2xl"],
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginTop: spacing.lg,
  },
  placeholderText: {
    fontFamily: fonts.sansMedium,
    fontSize: type.base,
    color: colors.onSurfaceSecondary,
    marginTop: spacing.xs,
  },
  placeholderSub: {
    fontFamily: fonts.sans,
    fontSize: type.sm,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
  },

  partRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  partQty: {
    fontFamily: fonts.mono,
    fontSize: type.base,
    color: colors.brandTertiary,
    minWidth: 28,
  },
  partName: { fontFamily: fonts.sansMedium, fontSize: type.base, color: colors.onSurface },
  partDesignators: { fontSize: 11, color: colors.onSurfaceTertiary },
  partNote: { fontSize: type.sm, color: colors.onSurfaceTertiary },

  stepRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  stepNumber: {
    fontFamily: fonts.mono,
    fontSize: type.base,
    color: colors.brandTertiary,
    minWidth: 20,
    lineHeight: 21,
  },
  stepChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },

  collapsibleLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: type.base,
    color: colors.onSurfaceSecondary,
  },

  netRow: {
    gap: 2,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  netHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  netName: {
    fontFamily: fonts.mono,
    fontSize: type.sm,
    letterSpacing: 0.5,
  },
  netPins: { color: colors.onSurface },
  netParts: { fontFamily: fonts.sans, fontSize: 11, color: colors.onSurfaceTertiary },

  componentRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  componentId: {
    fontFamily: fonts.mono,
    fontSize: type.sm,
    color: colors.brandTertiary,
    minWidth: 40,
    lineHeight: 20,
  },
  componentLabel: { fontFamily: fonts.sansMedium, fontSize: type.base, color: colors.onSurface },
  componentValue: { fontFamily: fonts.mono, fontSize: type.sm, color: colors.onSurfaceTertiary },
  componentPins: { fontSize: 11, color: colors.onSurfaceTertiary },
  componentNotes: { fontSize: type.sm, color: colors.onSurfaceTertiary },
});
