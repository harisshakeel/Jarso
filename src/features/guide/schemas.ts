import { z } from "zod";
import { contentKey, phaseSchema, stepAnswerSchema, topicKeys } from "@/features/learning";

/** The longest message a child can send (spec §5.2). */
export const MAX_MESSAGE_LENGTH = 280;

/** Turns per chat before "Start a new chat" (spec §5.1). */
export const MAX_TURNS = 12;

const stepRef = {
  source: z.enum(["mission", "practice", "topic"]),
  missionKey: contentKey.nullable(),
  stepKey: contentKey,
  phase: phaseSchema,
};

/**
 * What the guide was opened about, as content keys only. The server looks the text up in
 * reviewed content, so nothing the browser sends becomes part of the guide's instructions.
 */
export const guideContextSchema = z.discriminatedUnion("entry", [
  z.object({ entry: z.literal("step"), ...stepRef, wrongTries: z.number().int().min(0).max(2) }),
  z.object({ entry: z.literal("why"), ...stepRef, answer: stepAnswerSchema.nullable() }),
  z.object({ entry: z.literal("topic"), topicKey: z.enum(topicKeys) }),
  z.object({ entry: z.literal("home") }),
]);

export type GuideContextRef = z.infer<typeof guideContextSchema>;

export const askGuideSchema = z.object({
  conversationId: z.uuid().nullable(),
  context: guideContextSchema,
  text: z
    .string()
    .trim()
    .min(1, "Type a question first.")
    .max(MAX_MESSAGE_LENGTH, `Keep it under ${MAX_MESSAGE_LENGTH} characters.`),
});

export const setGuideAccessSchema = z.object({
  childId: z.uuid(),
  enabled: z.boolean(),
});

export const rateGuideMessageSchema = z.object({
  messageId: z.uuid(),
  rating: z.union([z.literal(1), z.literal(-1)]),
});
