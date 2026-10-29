import { z } from "zod";
import { rawCheckIn, rawMissions, rawReviews, rawTopics } from "@/content/learning";
import { checkInSchema, missionSchema, reviewPoolSchema, topicSchema } from "./schemas";
import type { SkillKey, TopicKey } from "./skills";
import type { AnswerableStep, CheckIn, Mission, Topic } from "./types";

/**
 * Parses the learning content once, when the module loads. Invalid content throws here, so a
 * bad JSON edit fails `next build`, the unit tests and CI rather than reaching a child.
 */

const missionsSchema = z
  .array(missionSchema)
  .length(7)
  .superRefine((missions, ctx) => {
    missions.forEach((mission, index) => {
      if (mission.day !== index + 1)
        ctx.addIssue({ code: "custom", message: `${mission.key} should be day ${index + 1}` });
    });
    if (new Set(missions.map((m) => m.key)).size !== missions.length)
      ctx.addIssue({ code: "custom", message: "duplicate mission keys" });
  });

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid learning content (${what}):\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const missions: readonly Mission[] = parse(missionsSchema, rawMissions, "missions");
export const topics: readonly Topic[] = parse(z.array(topicSchema).length(5), rawTopics, "topics");
export const reviewPool: readonly AnswerableStep[] = parse(reviewPoolSchema, rawReviews, "reviews");
export const checkIn: CheckIn = parse(checkInSchema, rawCheckIn, "check-in");

/** Keys that are routes under /child/learn, so no mission may use them. */
export const reservedMissionKeys = ["check-in", "practice", "topics"] as const;

export function findMission(key: string): Mission | undefined {
  return missions.find((mission) => mission.key === key);
}

export function findTopic(key: string): Topic | undefined {
  return topics.find((topic) => topic.key === key);
}

export function topicForSkill(skill: SkillKey): Topic | undefined {
  return topics.find((topic) => topic.skills.includes(skill));
}

export function reviewItemsFor(skill: SkillKey): AnswerableStep[] {
  return reviewPool.filter((item) => item.skill === skill);
}

export function findReviewItem(key: string): AnswerableStep | undefined {
  return reviewPool.find((item) => item.key === key);
}

/** Which topic page a mission links to. The mixed review links to the first topic. */
export function missionTopicKey(mission: Mission): TopicKey {
  return mission.topic === "mixed" ? "spending" : mission.topic;
}
