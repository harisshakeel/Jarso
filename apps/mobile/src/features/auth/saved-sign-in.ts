import { type ChildSignInInput, childSignInSchema } from "@jarso/core/family";
import * as SecureStore from "expo-secure-store";
import { logger } from "@/lib";

// Opt-in "Remember me": the code, nickname and PIN sit in the OS keystore (Android Keystore,
// iOS Keychain), next to the session tokens, which already grant more than the PIN does.
const KEY = "jarso.saved-sign-in";
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** The details saved on this device, or null. Anything unreadable is dropped. */
export async function loadSavedSignIn(): Promise<ChildSignInInput | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
    if (raw === null) return null;
    const parsed = childSignInSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // No error detail: a JSON parse message can quote the stored PIN.
    logger.warn("Could not read the saved sign-in");
  }
  await forgetSignIn();
  return null;
}

export async function saveSignIn(input: ChildSignInInput): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(input), OPTIONS);
}

export async function forgetSignIn(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, OPTIONS).catch(() => undefined);
}
