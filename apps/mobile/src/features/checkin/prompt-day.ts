import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "@/lib";

const key = (userId: string) => `jarso-checkin-asked:${userId}`;

/** The family-local day the check-in was last asked on this phone; null if never or unreadable. */
export async function readPromptDay(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key(userId));
  } catch {
    logger.warn("Could not read the check-in day");
    return null;
  }
}

/** Remembers that today's check-in was asked. Never throws. */
export async function writePromptDay(userId: string, day: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), day);
  } catch {
    logger.warn("Could not save the check-in day");
  }
}
