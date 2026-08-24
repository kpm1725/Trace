/**
 * VioletSeedLabs — parent-company attribution.
 *
 * Purely presentational: no state, no navigation, no network. It exists so the
 * mark is defined once and every placement stays identical, rather than each
 * screen hand-rolling its own wording and spacing.
 *
 * Lifted from Scribe unchanged in structure — the seed glyph is drawn with
 * plain views and border radii rather than an SVG. Trace does carry
 * `react-native-svg` for the circuit renderer, so the original reason (avoiding
 * a native dependency) no longer applies here; keeping it identical to Scribe's
 * is now the reason, so the mark cannot drift between the two apps.
 */
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";

import { colors, fonts, spacing } from "@/src/theme";

type Props = {
  /** "light" for dark surfaces; "dark" for light ones. Trace is dark by default. */
  tone?: "light" | "dark";
  /**
   * "byline"   — "A Violet Seed Labs company", for screen footers.
   * "wordmark" — "VIOLET SEED LABS" in letterspaced caps, for a lockup.
   * "tagline"  — the byline with "Built to grow" beneath it, for the about screen.
   */
  variant?: "byline" | "wordmark" | "tagline";
  style?: StyleProp<ViewStyle>;
};

/** The seed: a leaf/teardrop, rounded on one diagonal and pointed on the other. */
function SeedGlyph({ color, size = 9 }: { color: string; size?: number }) {
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        borderTopLeftRadius: size,
        borderBottomRightRadius: size,
        borderTopRightRadius: 1,
        borderBottomLeftRadius: 1,
        transform: [{ rotate: "-12deg" }],
      }}
    />
  );
}

export function VioletSeedLabs({ tone = "light", variant = "byline", style }: Props) {
  const color = tone === "light" ? colors.parentOnDark : colors.parent;
  const isWordmark = variant === "wordmark";

  const row = (
    <View
      style={styles.row}
      accessible
      accessibilityRole="text"
      accessibilityLabel="A Violet Seed Labs company"
    >
      <SeedGlyph color={color} size={isWordmark ? 10 : 8} />
      <Text style={[isWordmark ? styles.wordmark : styles.byline, { color }]}>
        {isWordmark ? "VIOLET SEED LABS" : "A Violet Seed Labs company"}
      </Text>
    </View>
  );

  if (variant !== "tagline") return <View style={style}>{row}</View>;

  return (
    <View style={[styles.stack, style]}>
      {row}
      <Text style={[styles.tagline, { color }]}>Built to grow</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  stack: {
    alignItems: "center",
    gap: spacing.xs,
  },
  byline: {
    fontFamily: fonts.sans,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  wordmark: {
    fontFamily: fonts.sansBold,
    fontSize: 10,
    letterSpacing: 2.5,
  },
  tagline: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontStyle: "italic",
    letterSpacing: 0.3,
  },
});
