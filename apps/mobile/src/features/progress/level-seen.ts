import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "@/lib";

const key = (userId: string) => `jarso-level-seen:${userId}`;

/** The level this phone last showed the child; null if never, unreadable or not a level. */
export async function readLevelSeen(userId: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    const level = raw === null ? Number.NaN : Number(raw);
    return Number.isInteger(level) && level >= 1 ? level : null;
  } catch {
    logger.warn("Could not read the level seen");
    return null;
  }
}

/** Remembers the level shown. Never throws. */
export async function writeLevelSeen(userId: string, level: number): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), String(level));
  } catch {
    logger.warn("Could not save the level seen");
  }
}
