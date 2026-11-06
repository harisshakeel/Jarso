import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "@/lib";

// The phone's cache of "this child has done the intro", so a returning child's cold start needs
// no network read. The server's child_tours row stays the truth (onboardingGate).
const key = (userId: string) => `jarso-onboarded:${userId}`;

/** Whether this child finished or skipped the intro on this phone; false when unreadable. */
export async function readOnboarded(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key(userId))) === "1";
  } catch {
    logger.warn("Could not read the intro flag");
    return false;
  }
}

/** Remembers the intro is done for this child. Never throws. */
export async function writeOnboarded(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), "1");
  } catch {
    logger.warn("Could not save the intro flag");
  }
}
