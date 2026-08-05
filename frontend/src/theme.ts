// Design tokens — Violet Seed Labs brand palette. Dark mode is the default theme.

export const colors = {
  background: "#1A1428",
  onBackground: "#FAF9FB",
  surface: "#241C38",
  onSurface: "#FAF9FB",
  surfaceSecondary: "#2E2447",
  onSurfaceSecondary: "#C9C2D6",
  surfaceTertiary: "#382C56",
  onSurfaceTertiary: "#A99FBD",
  surfaceInverse: "#FAF9FB",
  onSurfaceInverse: "#1A1428",

  brand: "#8B5CF6",
  brandPrimary: "#8B5CF6",
  brandPrimaryDark: "#4C1D95",
  onBrandPrimary: "#FAF9FB",
  brandAccent: "#C4B5FD",
  onBrandAccent: "#1A1428",

  success: "#4ADE80",
  onSuccess: "#0B1F12",
  warning: "#FBBF24",
  error: "#F87171",
  info: "#93C5FD",

  border: "#3A2F55",
  borderStrong: "#4C1D95",
  divider: "#3A2F55",
};

export const gradient = {
  brand: ["#4C1D95", "#8B5CF6"] as const,
};

export const fonts = {
  sans: "System",
  sansMedium: "System",
  sansBold: "System",
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
