import { useFonts } from "expo-font";

/**
 * Load app fonts from local assets.
 *
 * Inter for the interface, Space Mono for anything a user might transcribe onto
 * a board — component values, pin names, net names. Both are OFL-licensed and
 * carried over from Scribe's `assets/fonts/`.
 *
 * Trace drops Scribe's Cormorant Garamond: a literary serif is exactly wrong on
 * a bench tool.
 */
export function useAppFonts() {
  return useFonts({
    Inter: require("../../assets/fonts/Inter-Regular.ttf"),
    InterMedium: require("../../assets/fonts/Inter-Medium.ttf"),
    InterBold: require("../../assets/fonts/Inter-Bold.ttf"),
    SpaceMono: require("../../assets/fonts/SpaceMono-Regular.ttf"),
  });
}
