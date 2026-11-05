import * as SecureStore from "expo-secure-store";
import { colorScheme, useColorScheme } from "nativewind";
import { useEffect } from "react";
import { Appearance } from "react-native";
import { logger } from "@/lib";

/** Light or dark, kept on this device. There is no "follow the phone" choice. */
export type ThemeChoice = "light" | "dark";

export const THEME_KEY = "theme";

const isChoice = (value: string | null): value is ThemeChoice =>
  value === "light" || value === "dark";

/** The phone's own scheme right now (read at start-up, before any choice is applied). */
const phoneScheme = (): ThemeChoice => (Appearance.getColorScheme() === "dark" ? "dark" : "light");

/** Flips of the switch this session, and the latest one, so start-up never undoes a flip. */
let flips = 0;
let flipped: ThemeChoice = "light";

/** Saves run one after another, so the last choice made is the one kept. */
let saving: Promise<void> = Promise.resolve();

function store(choice: ThemeChoice): Promise<void> {
  saving = saving.then(async () => {
    try {
      await SecureStore.setItemAsync(THEME_KEY, choice);
    } catch (error) {
      logger.warn("Could not save the theme choice", { error });
    }
  });
  return saving;
}

/**
 * The stored choice. With nothing usable stored (first launch, or an old "system"), the phone's
 * scheme now, saved at once so it stays put until the switch is flipped. A failed read uses the
 * phone's scheme but saves nothing, so a real choice it couldn't read is not overwritten. If the
 * switch is flipped while this runs, that flip wins: nothing is saved over it and it is returned.
 */
export async function loadTheme(): Promise<ThemeChoice> {
  const before = flips;
  let stored: string | null;
  try {
    stored = await SecureStore.getItemAsync(THEME_KEY);
  } catch (error) {
    logger.warn("Could not read the theme choice", { error });
    return flips === before ? phoneScheme() : flipped;
  }
  if (flips !== before) return flipped;
  if (isChoice(stored)) return stored;
  const choice = phoneScheme();
  await store(choice);
  return flips === before ? choice : flipped;
}

/** Applies the choice now and remembers it. A failed save only means it is not kept. */
export async function setTheme(choice: ThemeChoice): Promise<void> {
  flips += 1;
  flipped = choice;
  colorScheme.set(choice);
  await store(choice);
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

/** The Dark mode switch: on while the app is dark; flipping it applies and stores the choice. */
export function useDarkMode(): [boolean, (on: boolean) => void] {
  const { colorScheme: scheme } = useColorScheme();
  return [scheme === "dark", (on) => void setTheme(on ? "dark" : "light")];
}
