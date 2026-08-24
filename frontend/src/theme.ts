// Design tokens — Violet Seed Labs / Trace.
//
// Dark by default. The palette is built around the brand gradient
// (#4C1D95 -> #8B5CF6) on a near-black ground, with lavender as the accent for
// anything that needs to read as active without shouting.
//
// Token names mirror Scribe's `src/theme.ts` exactly — surface/onSurface,
// brand/onBrandPrimary, and so on — so a component can be lifted between the
// two apps without a rename. Only the values differ.

export const colors = {
  surface: "#1A1428",
  onSurface: "#FAF9FB",
  surfaceSecondary: "#241C36",
  onSurfaceSecondary: "#CFC7DE",
  surfaceTertiary: "#2E2444",
  onSurfaceTertiary: "#9B90B0",
  surfaceInverse: "#FAF9FB",
  onSurfaceInverse: "#1A1428",

  brand: "#8B5CF6",
  brandPrimary: "#8B5CF6",
  onBrandPrimary: "#FAF9FB",
  brandSecondary: "#4C1D95",
  brandTertiary: "#C4B5FD",
  onBrandTertiary: "#2E1065",

  success: "#4ADE80",
  onSuccess: "#052E16",
  warning: "#FBBF24",
  error: "#F87171",
  info: "#93C5FD",

  border: "#332A4A",
  borderStrong: "#4A3E68",
  divider: "#332A4A",

  // Violet Seed Labs — the parent-company mark. Trace and its parent share a
  // violet, which is the problem this pair solves: an attribution in the
  // product's own #8B5CF6 competes with the product. These are desaturated far
  // enough to read as a quiet signature beside it, the same relationship the
  // mark has to Scribe's rust.
  parent: "#8B7FA3",
  parentOnDark: "#B9AECC",
};

/** The brand gradient. Splash, primary buttons, and the app header use it. */
export const gradient = {
  brand: [colors.brandSecondary, colors.brandPrimary] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

export const fonts = {
  sans: "Inter",
  sansMedium: "InterMedium",
  sansBold: "InterBold",
  // Component values, pin names, and net names are read character by character
  // — "1N4148" and "1N4448" differ by one glyph, and a proportional face makes
  // that harder to catch. Everything a user might transcribe onto a board is
  // set in mono.
  mono: "SpaceMono",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
};

export const radius = {
  sm: 4,
  md: 8,
  lg: 16,
  pill: 999,
};

export const type = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  "2xl": 24,
  display: 32,
  hero: 44,
};

/** Confidence badges on a diagnosis. Colour carries the same meaning everywhere. */
export const confidenceColors = {
  high: colors.success,
  medium: colors.warning,
  low: colors.onSurfaceTertiary,
} as const;
