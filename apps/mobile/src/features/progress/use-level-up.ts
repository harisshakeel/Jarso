import { lookCopy, moodFor } from "@jarso/core/mascot";
import { levelProgress, levelUpCopy, levelUpDecision, newWear } from "@jarso/core/progress";
import { useEffect, useRef } from "react";
import { useCelebrate } from "@/components/celebrate";
import { useSession } from "@/features/auth";
import { readLevelSeen, writeLevelSeen } from "./level-seen";
import { useProgress, useSetJarsoLook } from "./use-progress";

/**
 * Watches the child's level. When it rises past the level this phone last showed, one grape
 * celebration names the new level and, when a look unlocks, offers "Wear it". The first read on
 * a phone only remembers the level. Never throws.
 */
export function useLevelUp(): void {
  const { userId } = useSession();
  const { data: progress } = useProgress();
  const setLook = useSetJarsoLook();
  const celebrate = useCelebrate();
  // `userId:level` already handled in this run, so a failed storage write can't repeat it.
  const handled = useRef(new Set<string>());
  const level = progress?.level;
  const sparks = progress?.sparks ?? 0;
  const look = progress?.look;

  // biome-ignore lint/correctness/useExhaustiveDependencies: once per child and level
  useEffect(() => {
    if (!userId || level === undefined || !look) return;
    const mark = `${userId}:${level}`;
    if (handled.current.has(mark)) return;
    handled.current.add(mark);
    void (async () => {
      const seen = await readLevelSeen(userId);
      const decision = levelUpDecision(seen, level);
      if (decision === "none") return;
      await writeLevelSeen(userId, level);
      if (decision !== "celebrate" || seen === null) return;
      const wear = newWear(seen, level);
      const name = levelProgress(sparks).name;
      celebrate({
        title: levelUpCopy.title(level, name),
        subtitle: levelUpCopy.eyebrow,
        mood: moodFor("levelUp"),
        tone: "grape",
        sound: "cheer",
        look: wear ? { ...look, wear } : look,
        chips: wear
          ? [{ icon: "unlock", label: levelUpCopy.unlocked(lookCopy.wear[wear]) }]
          : undefined,
        primary: wear
          ? { label: levelUpCopy.wearIt, onPress: () => setLook.mutate({ ...look, wear }) }
          : { label: levelUpCopy.yay },
        secondary: wear ? { label: levelUpCopy.later } : undefined,
      });
    })();
  }, [userId, level]);
}

/** `useLevelUp()` for the child layout, inside the CelebrationProvider. Renders nothing. */
export function LevelUpWatcher(): null {
  useLevelUp();
  return null;
}
