import * as SecureStore from "expo-secure-store";
import { colorScheme } from "nativewind";
import { useEffect, useState } from "react";
import { logger } from "@/lib";

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "theme";

const CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];
const isChoice = (value: string | null): value is ThemeChoice =>
  CHOICES.includes(value as ThemeChoice);

/** The stored choice; "system" when nothing (or something unknown) is stored or the read fails. */
export async function loadTheme(): Promise<ThemeChoice> {
  try {
    const stored = await SecureStore.getItemAsync(THEME_KEY);
    return isChoice(stored) ? stored : "system";
  } catch (error) {
    logger.warn("Could not read the theme choice", { error });
    return "system";
  }
}

/** Applies the choice now and remembers it. A failed save only means it is not kept. */
export async function setTheme(choice: ThemeChoice): Promise<void> {
  colorScheme.set(choice);
  try {
    await SecureStore.setItemAsync(THEME_KEY, choice);
  } catch (error) {
    logger.warn("Could not save the theme choice", { error });
  }
}

/** Applies the stored choice once at start-up (root layout). */
export function useStoredTheme(): void {
  useEffect(() => {
    let live = true;
    void loadTheme().then((choice) => {
      if (live) colorScheme.set(choice);
    });
    return () => {
      live = false;
    };
  }, []);
}

/** The choice for the Settings control: "system" until the stored one has loaded. */
export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => {
    let live = true;
    void loadTheme().then((stored) => {
      if (live) setChoice(stored);
    });
    return () => {
      live = false;
    };
  }, []);
  return [
    choice,
    (next) => {
      setChoice(next);
      void setTheme(next);
    },
  ];
}
