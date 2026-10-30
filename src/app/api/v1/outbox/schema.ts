import { z } from "zod";
import { purchaseSchema } from "@/features/diary";
import {
  completeCheckInSchema,
  completeMissionSchema,
  recordPracticeSchema,
  recordStepSchema,
} from "@/features/learning";

/**
 * One queued child action as `POST /api/v1/outbox` receives it. Each payload is parsed by the
 * feature's own schema, so the outbox has no second validation path. No feature schema has an
 * `occurredAt`, so a client-sent time is stripped: the route derives it from `ageMs`.
 */
export const outboxRequestSchema = (currency: string) => {
  const base = {
    userId: z.string().min(1),
    /** How long ago the child did it, on the device clock. */
    ageMs: z.int().min(0),
  };
  return z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("purchase"), ...base, payload: purchaseSchema(currency) }),
    z.object({ kind: z.literal("practice"), ...base, payload: recordPracticeSchema }),
    z.object({ kind: z.literal("step"), ...base, payload: recordStepSchema }),
    z.object({ kind: z.literal("completeMission"), ...base, payload: completeMissionSchema }),
    z.object({ kind: z.literal("checkIn"), ...base, payload: completeCheckInSchema }),
  ]);
};

export type OutboxRequest = z.infer<ReturnType<typeof outboxRequestSchema>>;
