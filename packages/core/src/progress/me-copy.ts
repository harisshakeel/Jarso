import { BADGE_KEYS, type BadgeKey } from "./badges";

/** The child's Me screen (the trophy room). */
export const meCopy = {
  title: "Me",
  you: "You",
  level: (level: number, name: string) => `Level ${level} · ${name}`,
  toNext: (sparks: number, next: number) => `${sparks} ⚡ to Level ${next}`,
  topLevel: "Top level!",
  levelBar: "Level progress",
  streak: (n: number) => `${n} day streak`,
  sparks: (n: number) => `${n} Sparks`,
  badgesHeading: "My badges",
  badgeCount: (n: number, total: number) => `${n} of ${total}`,
  badgeEarned: (name: string) => `${name}, earned`,
  badgeLocked: (name: string) => `${name}, not yet`,
  settings: "Settings",
  sound: "Sound effects",
  myAsks: "My asks",
  signIn: (nickname: string | null) =>
    `${nickname ? `You sign in as ${nickname}.` : "Your nickname is how you sign in."} A parent can change your nickname or PIN.`,
};

/** Every badge once: the earned ones first (oldest first), then the rest in `BADGE_KEYS` order. */
export function badgeShelf(
  earned: readonly { key: BadgeKey; earnedAt: string }[],
): { key: BadgeKey; earned: boolean }[] {
  const got = [...earned].sort((a, b) => a.earnedAt.localeCompare(b.earnedAt));
  const keys = new Set(got.map((b) => b.key));
  return [
    ...[...keys].map((key) => ({ key, earned: true })),
    ...BADGE_KEYS.filter((key) => !keys.has(key)).map((key) => ({ key, earned: false })),
  ];
}
