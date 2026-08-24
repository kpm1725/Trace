/**
 * The diagnosis view. Shared by `app/debug.tsx` and `app/session/[id].tsx`.
 *
 * Section order is the product's argument, not a layout accident:
 *
 *   1. Cautions        — safety outranks everything, including the answer
 *   2. Image quality   — if the photo is unreadable, say so before diagnosing
 *                        from it, or the ranking below reads as more solid
 *                        than it is
 *   3. Next measurement— the single most actionable line, above the reasoning
 *                        someone may never scroll to
 *   4. Observation     — what the model saw, so the user can check it before
 *                        trusting anything derived from it
 *   5. Likely causes   — ranked, each with its own confidence
 *   6. Can't tell      — the limits of the photograph
 *
 * Putting (6) last is deliberate and is the one call worth defending: it reads
 * as a closing caveat rather than a disclaimer nobody gets past. It is never
 * omitted — the schema requires it.
 */
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Body, Callout, Collapsible, Mono, SectionHeading } from "@/src/components/ui";
import { colors, confidenceColors, fonts, radius, spacing, type } from "@/src/theme";
import { Confidence, Diagnosis, LikelyCause } from "@/src/types";

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "Likely",
  medium: "Possible",
  low: "Long shot",
};

const IMAGE_QUALITY_NOTE: Record<Diagnosis["image_quality"], string | null> = {
  clear: null,
  usable: null,
  poor: "The photo is hard to read — the ranking below is weaker than usual. A sharper, better-lit shot with the whole board in frame would narrow it down a lot.",
};

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const color = confidenceColors[confidence];
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.badgeText, { color }]}>{CONFIDENCE_LABEL[confidence]}</Text>
    </View>
  );
}

function Cause({ cause, defaultOpen }: { cause: LikelyCause; defaultOpen: boolean }) {
  return (
    <View style={styles.cause} testID={`cause-${cause.rank}`}>
      <Collapsible
        defaultOpen={defaultOpen}
        header={
          <View style={styles.causeHeader}>
            <View style={styles.causeTitleRow}>
              <Text style={styles.causeRank}>{cause.rank}</Text>
              <Text style={styles.causeName}>{cause.cause}</Text>
            </View>
            <ConfidenceBadge confidence={cause.confidence} />
          </View>
        }
      >
        <Body style={{ marginTop: spacing.xs }}>{cause.reasoning}</Body>

        <View style={styles.checkRow}>
          <Ionicons name="pulse-outline" size={15} color={colors.brandTertiary} />
          <Mono style={{ flex: 1, color: colors.brandTertiary }}>{cause.how_to_check}</Mono>
        </View>

        {cause.fix_steps.length > 0 && (
          <View style={{ gap: spacing.xs }}>
            <Text style={styles.fixLabel}>If that&apos;s it</Text>
            {cause.fix_steps.map((step, i) => (
              <Body key={i}>
                {cause.fix_steps.length > 1 ? `${i + 1}. ` : ""}
                {step}
              </Body>
            ))}
          </View>
        )}
      </Collapsible>
    </View>
  );
}

export function DiagnosisResult({ diagnosis }: { diagnosis: Diagnosis }) {
  const qualityNote = IMAGE_QUALITY_NOTE[diagnosis.image_quality];

  return (
    <View testID="diagnosis-result">
      {diagnosis.cautions.length > 0 && (
        <Callout tone="warning" title="Take care" items={diagnosis.cautions} testID="diagnosis-cautions" />
      )}

      {qualityNote && (
        <Callout tone="info" title="Hard to see" items={[qualityNote]} testID="diagnosis-quality" />
      )}

      <View style={styles.measureCard} testID="diagnosis-next-measurement">
        <View style={styles.measureHead}>
          <Ionicons name="speedometer-outline" size={16} color={colors.brandTertiary} />
          <Text style={styles.measureLabel}>Measure this first</Text>
        </View>
        <Text style={styles.measureText}>{diagnosis.next_measurement}</Text>
      </View>

      <SectionHeading>What I can see</SectionHeading>
      <Body>{diagnosis.observation}</Body>

      {diagnosis.likely_causes.length > 0 && (
        <>
          <SectionHeading>
            Likely causes
            {diagnosis.likely_causes.length > 1 ? ` (${diagnosis.likely_causes.length})` : ""}
          </SectionHeading>
          {diagnosis.likely_causes.map((cause, i) => (
            // The top-ranked cause is open on arrival; the rest are a tap away.
            <Cause key={cause.rank} cause={cause} defaultOpen={i === 0} />
          ))}
        </>
      )}

      {diagnosis.cannot_tell_from_photo.length > 0 && (
        <Callout
          tone="muted"
          title="What the photo can't tell me"
          items={diagnosis.cannot_tell_from_photo}
          testID="diagnosis-limits"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  measureCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  measureHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  measureLabel: {
    fontFamily: fonts.sansBold,
    fontSize: type.sm,
    color: colors.brandTertiary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  measureText: {
    fontFamily: fonts.sans,
    fontSize: type.lg,
    lineHeight: 24,
    color: colors.onSurface,
  },
  cause: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  causeHeader: { gap: spacing.sm },
  causeTitleRow: { flexDirection: "row", gap: spacing.md },
  causeRank: {
    fontFamily: fonts.mono,
    fontSize: type.base,
    color: colors.onSurfaceTertiary,
    lineHeight: 21,
  },
  causeName: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: type.base,
    lineHeight: 21,
    color: colors.onSurface,
  },
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    marginLeft: spacing.xl,
  },
  badgeText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  checkRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  fixLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: type.sm,
    color: colors.onSurfaceTertiary,
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
});
