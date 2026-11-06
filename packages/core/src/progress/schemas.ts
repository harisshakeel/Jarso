import { z } from "zod";
import { parseLook } from "../mascot";
import { BADGE_KEYS, type BadgeKey } from "./badges";

const KNOWN: ReadonlySet<string> = new Set(BADGE_KEYS);

const badgeSchema = z.object({ key: z.string(), earnedAt: z.string() });

export const progressSchema = z.object({
  sparks: z.number().int().min(0),
  level: z.number().int().min(1).max(10),
  nextLevelAt: z.number().int().nullable(),
  streak: z.number().int().min(0),
  bestStreak: z.number().int().min(0),
  restUsedThisWeek: z.boolean(),
  checkedInToday: z.boolean(),
  // Lenient: an unknown lid or outfit (a newer server) falls back instead of failing the parse.
  look: z.unknown().transform(parseLook),
  badges: z
    .array(badgeSchema)
    .transform((list) =>
      list.filter((b): b is { key: BadgeKey; earnedAt: string } => KNOWN.has(b.key)),
    ),
  recent: z.array(z.object({ kind: z.string(), amount: z.number().int(), createdAt: z.string() })),
});
export type Progress = z.infer<typeof progressSchema>;

export const checkinAnswerSchema = z.enum(["yes", "nope"]);
export type CheckinAnswer = z.infer<typeof checkinAnswerSchema>;

export const childFacingNameSchema = z.string().trim().min(1).max(20).nullish();
