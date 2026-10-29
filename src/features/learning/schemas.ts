import { z } from "zod";
import { skillKeys, topicKeys } from "./skills";

/**
 * Learning content is authored as JSON in `src/content/learning` (architecture §5.3) and parsed
 * with these schemas when the module loads, so invalid content fails the build and the content
 * test. Amounts are fictional and in minor units; text writes them as `{m:1250}` (see text.ts).
 */

export const contentKey = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case key")
  .max(40);
const text = z.string().trim().min(1).max(400);
const shortText = z.string().trim().min(1).max(220);
/** Fictional amounts stay small: at most 10,000.00 in minor units. */
const minor = z.number().int().min(0).max(1_000_000);
const skill = z.enum(skillKeys);
const hints = z.tuple([shortText, shortText]);
const option = z.object({ id: contentKey, text: shortText, feedback: shortText });

// Each answerable step has a shape; a step adds its key and an optional replay: the same type
// with different numbers, used when the step comes back at the end of a mission.

const choiceShape = {
  type: z.literal("choice"),
  skill,
  prompt: text,
  options: z.array(option).min(2).max(4),
  answer: contentKey,
  hints,
  correct: shortText,
};
const predictShape = { ...choiceShape, type: z.literal("predict"), outcome: text };
const reasonShape = { ...choiceShape, type: z.literal("reason") };
const amountShape = {
  type: z.literal("amount"),
  skill,
  prompt: text,
  unit: z.enum(["money", "count"]),
  /** Shown after a count input: "weeks". */
  suffix: z.string().trim().min(1).max(20).optional(),
  answer: minor,
  misconceptions: z
    .array(z.object({ value: minor, feedback: shortText }))
    .max(4)
    .default([]),
  wrong: shortText,
  hints,
  correct: shortText,
};
const splitShape = {
  type: z.literal("split"),
  skill,
  prompt: text,
  total: minor.positive(),
  /** Slider step in minor units. */
  increment: z.number().int().positive().default(50),
  rule: z.object({
    minSave: minor.optional(),
    maxSave: minor.optional(),
    exactSave: minor.optional(),
  }),
  wrong: shortText,
  hints,
  correct: shortText,
};
const sortShape = {
  type: z.literal("sort"),
  skill,
  prompt: text,
  buckets: z.tuple([
    z.object({ id: contentKey, label: z.string().trim().min(1).max(40) }),
    z.object({ id: contentKey, label: z.string().trim().min(1).max(40) }),
  ]),
  items: z
    .array(z.object({ id: contentKey, text: shortText, bucket: contentKey }))
    .min(3)
    .max(6),
  wrong: shortText,
  hints,
  correct: shortText,
};
const matchShape = {
  type: z.literal("match"),
  skill,
  prompt: text,
  pairs: z
    .array(
      z.object({
        id: contentKey,
        term: z.string().trim().min(1).max(60),
        meaning: shortText,
      }),
    )
    .min(3)
    .max(4),
  wrong: shortText,
  hints,
  correct: shortText,
};

const infoStepSchema = z.object({
  type: z.literal("info"),
  key: contentKey,
  title: z.string().trim().min(1).max(80).optional(),
  body: text,
  example: text.optional(),
});

const withKey = <S extends z.ZodRawShape>(shape: S) =>
  z.object({ ...shape, key: contentKey, replay: z.object(shape).optional() });

export const answerableStepSchema = z.discriminatedUnion("type", [
  withKey(choiceShape),
  withKey(predictShape),
  withKey(reasonShape),
  withKey(amountShape),
  withKey(splitShape),
  withKey(sortShape),
  withKey(matchShape),
]);

export const stepSchema = z.discriminatedUnion("type", [
  infoStepSchema,
  withKey(choiceShape),
  withKey(predictShape),
  withKey(reasonShape),
  withKey(amountShape),
  withKey(splitShape),
  withKey(sortShape),
  withKey(matchShape),
]);

type AnswerableStep = z.infer<typeof answerableStepSchema>;
type AnswerableBody = AnswerableStep extends infer T
  ? T extends unknown
    ? Omit<T, "key" | "replay">
    : never
  : never;

/** Internal consistency of one step body: the answer exists, the rule can be met, etc. */
function bodyProblems(body: AnswerableBody): string[] {
  const problems: string[] = [];
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  switch (body.type) {
    case "choice":
    case "predict":
    case "reason":
      if (!body.options.some((o) => o.id === body.answer)) problems.push("answer is not an option");
      if (!unique(body.options.map((o) => o.id))) problems.push("duplicate option ids");
      break;
    case "amount":
      if (body.misconceptions.some((m) => m.value === body.answer))
        problems.push("a misconception equals the answer");
      break;
    case "split": {
      const { minSave, maxSave, exactSave } = body.rule;
      if (minSave === undefined && maxSave === undefined && exactSave === undefined)
        problems.push("split rule is empty");
      for (const value of [minSave, maxSave, exactSave]) {
        if (value !== undefined && (value > body.total || value % body.increment !== 0))
          problems.push("split rule value is outside the total or off the slider steps");
      }
      if (body.total % body.increment !== 0) problems.push("total is not a multiple of increment");
      if (minSave !== undefined && maxSave !== undefined && minSave > maxSave)
        problems.push("minSave is above maxSave");
      break;
    }
    case "sort": {
      const bucketIds = body.buckets.map((b) => b.id);
      if (!unique(bucketIds)) problems.push("duplicate bucket ids");
      if (!unique(body.items.map((i) => i.id))) problems.push("duplicate item ids");
      if (body.items.some((i) => !bucketIds.includes(i.bucket)))
        problems.push("an item points at an unknown bucket");
      for (const id of bucketIds) {
        if (!body.items.some((i) => i.bucket === id)) problems.push(`bucket ${id} is empty`);
      }
      break;
    }
    case "match":
      if (!unique(body.pairs.map((p) => p.id))) problems.push("duplicate pair ids");
      if (!unique(body.pairs.map((p) => p.meaning))) problems.push("duplicate meanings");
      break;
  }
  return problems;
}

/** Adds an issue for every inconsistent step or replay. */
function checkSteps(steps: z.infer<typeof stepSchema>[], ctx: z.RefinementCtx, path: string) {
  const keys = new Set<string>();
  steps.forEach((step, index) => {
    if (keys.has(step.key))
      ctx.addIssue({ code: "custom", message: `${path}: duplicate step key ${step.key}` });
    keys.add(step.key);
    if (step.type === "info") return;
    const { key: _key, replay, ...body } = step;
    for (const problem of bodyProblems(body as AnswerableBody)) {
      ctx.addIssue({ code: "custom", path: [index], message: `${path} ${step.key}: ${problem}` });
    }
    if (replay) {
      for (const problem of bodyProblems(replay as AnswerableBody)) {
        ctx.addIssue({
          code: "custom",
          path: [index],
          message: `${path} ${step.key} replay: ${problem}`,
        });
      }
      if (replay.skill !== step.skill)
        ctx.addIssue({ code: "custom", message: `${path} ${step.key}: replay changes the skill` });
    }
  });
}

export const missionSchema = z
  .object({
    key: contentKey,
    version: z.number().int().positive(),
    day: z.number().int().min(1).max(7),
    title: z.string().trim().min(1).max(40),
    /** "mixed" is the day-7 review across every topic. */
    topic: z.enum([...topicKeys, "mixed"]),
    summary: shortText,
    steps: z.array(stepSchema).min(4).max(10),
  })
  .superRefine((mission, ctx) => {
    checkSteps(mission.steps, ctx, mission.key);
    const answerable = mission.steps.filter((s) => s.type !== "info").length;
    if (answerable < 4)
      ctx.addIssue({ code: "custom", message: `${mission.key}: fewer than 4 answerable steps` });
  });

export const topicSchema = z
  .object({
    key: z.enum(topicKeys),
    title: z.string().trim().min(1).max(60),
    intro: shortText,
    explanation: z.array(text).min(1).max(5),
    example: z.object({
      title: z.string().trim().min(1).max(60),
      lines: z.array(shortText).min(1).max(6),
    }),
    practice: answerableStepSchema,
    skills: z.array(z.enum(skillKeys)).min(1),
  })
  .superRefine((topic, ctx) => {
    const { key: _key, replay: _replay, ...body } = topic.practice;
    for (const problem of bodyProblems(body as AnswerableBody)) {
      ctx.addIssue({ code: "custom", message: `${topic.key} practice: ${problem}` });
    }
  });

/** One practice item in the review pool: a new situation for a skill (FR06, FR10). */
export const reviewItemSchema = answerableStepSchema;

export const reviewPoolSchema = z
  .array(reviewItemSchema)
  .min(1)
  .superRefine((items, ctx) => {
    checkSteps(items, ctx, "reviews");
  });

export const checkInSchema = z
  .object({
    version: z.number().int().positive(),
    questions: z.array(answerableStepSchema).length(5),
  })
  .superRefine((checkIn, ctx) => checkSteps(checkIn.questions, ctx, "check-in"));

// ---------------------------------------------------------------------------
// Answers and action inputs
// ---------------------------------------------------------------------------

const smallRecord = z
  .record(contentKey, contentKey)
  .refine((value) => Object.keys(value).length <= 8, "Too many entries");

export const stepAnswerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("option"), optionId: contentKey }),
  z.object({ kind: z.literal("number"), value: z.number().int().min(0).max(100_000_000) }),
  z.object({ kind: z.literal("split"), save: z.number().int().min(0).max(100_000_000) }),
  z.object({ kind: z.literal("sort"), placements: smallRecord }),
  z.object({ kind: z.literal("match"), pairs: smallRecord }),
]);

export const phaseSchema = z.enum(["main", "replay"]);

export const startMissionSchema = z.object({ missionKey: contentKey });

export const recordStepSchema = z.object({
  attemptId: z.uuid(),
  stepKey: contentKey,
  phase: phaseSchema,
  answer: stepAnswerSchema,
  hintsUsed: z.number().int().min(0).max(2),
  tries: z.number().int().min(1).max(2),
});

export const completeMissionSchema = z.object({ attemptId: z.uuid() });

export const recordPracticeSchema = z.object({
  itemKey: contentKey,
  answer: stepAnswerSchema,
  hintsUsed: z.number().int().min(0).max(2),
  tries: z.number().int().min(1).max(2),
});

export const completeCheckInSchema = z.object({
  answers: z.array(z.object({ stepKey: contentKey, answer: stepAnswerSchema })).length(5),
});
