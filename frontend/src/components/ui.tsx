/**
 * Small presentational primitives shared by the result views.
 *
 * These exist because `debug.tsx`, `generate.tsx` and `session/[id].tsx` all
 * render the same result components, and those in turn need the same handful of
 * shapes — a section heading, a callout, a collapsible block. Defining them once
 * is what keeps a diagnosis looking identical whether it was just generated or
 * opened from history.
 */
import { ReactNode, useState } from "react";
import { Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, fonts, radius, spacing, type } from "@/src/theme";

/** A lettered section label. The one heading style across every result view. */
export function SectionHeading({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.heading, style]}>{children}</Text>;
}

export function Body({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

/** Monospaced, for anything a user might transcribe onto a board. */
export function Mono({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.mono, style]}>{children}</Text>;
}

export function Chip({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "brand" }) {
  return (
    <View style={[styles.chip, tone === "brand" && { borderColor: colors.brandTertiary }]}>
      <Text style={[styles.chipText, tone === "brand" && { color: colors.brandTertiary }]}>
        {label}
      </Text>
    </View>
  );
}

type CalloutTone = "warning" | "info" | "muted";

const CALLOUT_TONES: Record<CalloutTone, { accent: string; icon: keyof typeof Ionicons.glyphMap }> = {
  warning: { accent: colors.warning, icon: "warning-outline" },
  info: { accent: colors.brandTertiary, icon: "information-circle-outline" },
  muted: { accent: colors.onSurfaceTertiary, icon: "help-circle-outline" },
};

/**
 * A bordered aside — safety warnings, image-quality notices, uncertainty.
 *
 * Tone carries the meaning, so the same colour means the same thing on every
 * screen: amber is "this could hurt you or a component", lavender is a hint,
 * grey is a limit of what's knowable.
 */
export function Callout({
  tone = "info",
  title,
  items,
  children,
  testID,
}: {
  tone?: CalloutTone;
  title: string;
  /** Rendered as a bulleted list. Use instead of `children` for plain strings. */
  items?: string[];
  children?: ReactNode;
  testID?: string;
}) {
  const { accent, icon } = CALLOUT_TONES[tone];
  return (
    <View style={[styles.callout, { borderColor: accent }]} testID={testID}>
      <View style={styles.calloutHead}>
        <Ionicons name={icon} size={16} color={accent} />
        <Text style={[styles.calloutTitle, { color: accent }]}>{title}</Text>
      </View>
      {items?.map((item, i) => (
        <Text key={i} style={styles.calloutItem}>
          {items.length > 1 ? "• " : ""}
          {item}
        </Text>
      ))}
      {children}
    </View>
  );
}

/**
 * A block that opens and closes on tap.
 *
 * A five-cause diagnosis with reasoning, a check and fix steps apiece is more
 * than fits on a phone screen, and scrolling past four of them to reach the
 * fifth is worse than tapping to open the one you want. `defaultOpen` is how
 * the most likely cause stays visible without a tap.
 */
export function Collapsible({
  header,
  defaultOpen = false,
  children,
  testID,
}: {
  /** Rendered inside the pressable row, left of the chevron. */
  header: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  testID?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View testID={testID}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.collapsibleHead, pressed && { opacity: 0.7 }]}
      >
        <View style={{ flex: 1 }}>{header}</View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.onSurfaceTertiary}
        />
      </Pressable>
      {open && <View style={styles.collapsibleBody}>{children}</View>}
    </View>
  );
}

/** A horizontal rule between result sections. */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  heading: {
    fontFamily: fonts.sansBold,
    fontSize: type.sm,
    color: colors.brandTertiary,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: type.base,
    lineHeight: 21,
    color: colors.onSurfaceSecondary,
  },
  mono: {
    fontFamily: fonts.mono,
    fontSize: type.sm,
    lineHeight: 20,
    color: colors.onSurfaceSecondary,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  chipText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.onSurfaceTertiary,
  },
  callout: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  calloutHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  calloutTitle: {
    fontFamily: fonts.sansBold,
    fontSize: type.sm,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  calloutItem: {
    fontFamily: fonts.sans,
    fontSize: type.base,
    lineHeight: 21,
    color: colors.onSurfaceSecondary,
  },
  collapsibleHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  collapsibleBody: { paddingBottom: spacing.lg, gap: spacing.sm },
  divider: { height: 1, backgroundColor: colors.divider },
});
