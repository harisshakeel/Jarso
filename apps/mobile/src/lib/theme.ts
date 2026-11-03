import { semantic } from "@jarso/brand/tokens";
import { DarkTheme, DefaultTheme, type Theme } from "expo-router";
import { useColorScheme } from "nativewind";

export type ColorScheme = keyof typeof semantic;

/** Navigation chrome (headers, tab bar, screen background) in the brand's colours. */
export const NAV_THEME: Record<ColorScheme, Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: semantic.light.background,
      border: semantic.light.border,
      card: semantic.light.card,
      notification: semantic.light.destructive,
      primary: semantic.light.primary,
      text: semantic.light.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: semantic.dark.background,
      border: semantic.dark.border,
      card: semantic.dark.card,
      notification: semantic.dark.destructive,
      primary: semantic.dark.primary,
      text: semantic.dark.foreground,
    },
  },
};

export type Tokens = (typeof semantic)[ColorScheme];

/** The brand's semantic colours for the current scheme, for what a class can't style (SVG, icons). */
export function useTokens(): Tokens {
  const { colorScheme } = useColorScheme();
  return semantic[colorScheme === "dark" ? "dark" : "light"];
}
