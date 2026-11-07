import { type SignInInput, signInSchema } from "@jarso/core/auth";
import { type ChildSignInInput, childSignInSchema } from "@jarso/core/family";
import * as SecureStore from "expo-secure-store";
import type { z } from "zod";
import { logger } from "@/lib";

// Opt-in "Remember me": the details sit in the OS keystore (Android Keystore, iOS Keychain),
// next to the session tokens, which already grant as much as the saved details do.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function savedDetails<T>(key: string, schema: z.ZodType<T>) {
  async function forget(): Promise<void> {
    await SecureStore.deleteItemAsync(key, OPTIONS).catch(() => undefined);
  }
  /** The details saved on this device, or null. Anything unreadable is dropped. */
  async function load(): Promise<T | null> {
    try {
      const raw = await SecureStore.getItemAsync(key, OPTIONS);
      if (raw === null) return null;
      const parsed = schema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    } catch {
      // No error detail: a JSON parse message can quote the stored PIN or password.
      logger.warn("Could not read the saved sign-in");
    }
    await forget();
    return null;
  }
  async function save(input: T): Promise<void> {
    await SecureStore.setItemAsync(key, JSON.stringify(input), OPTIONS);
  }
  return { load, save, forget };
}

const child = savedDetails<ChildSignInInput>("jarso.saved-sign-in", childSignInSchema);
export const loadSavedSignIn = child.load;
export const saveSignIn = child.save;
export const forgetSignIn = child.forget;

const parent = savedDetails<SignInInput>("jarso.saved-parent-sign-in", signInSchema);
export const loadSavedParentSignIn = parent.load;
export const saveParentSignIn = parent.save;
export const forgetParentSignIn = parent.forget;

export type SignInMode = "child" | "parent";

/** The last "I'm a child" / "I'm a parent" choice on this phone. Not a secret. */
const MODE_KEY = "jarso.sign-in-mode";

/**
 * The last sign-in choice, or null when none was ever kept on this phone (it then opens on
 * Welcome). A value that can't be read counts as `child`, so a broken keystore never loops.
 */
export async function loadSignInMode(): Promise<SignInMode | null> {
  let raw: string | null;
  try {
    raw = await SecureStore.getItemAsync(MODE_KEY);
  } catch {
    return "child";
  }
  if (raw === null) return null;
  return raw === "parent" ? "parent" : "child";
}

export async function saveSignInMode(mode: SignInMode): Promise<void> {
  await SecureStore.setItemAsync(MODE_KEY, mode).catch(() => undefined);
}
