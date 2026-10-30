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
 * feature's own schema, so the outbox has no second validation path. The step and check-in
 * schemas have no `occurredAt`; as plain `z.object`s they strip the one the outbox adds.
 */
export const outboxRequestSchema = (currency: string) => {
  const userId = z.string().min(1);
  return z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("purchase"), userId, payload: purchaseSchema(currency) }),
    z.object({ kind: z.literal("practice"), userId, payload: recordPracticeSchema }),
    z.object({ kind: z.literal("step"), userId, payload: recordStepSchema }),
    z.object({ kind: z.literal("completeMission"), userId, payload: completeMissionSchema }),
    z.object({ kind: z.literal("checkIn"), userId, payload: completeCheckInSchema }),
  ]);
};

export type OutboxRequest = z.infer<ReturnType<typeof outboxRequestSchema>>;
