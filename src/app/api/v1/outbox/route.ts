import { getFamilyContext } from "@/features/allowance/server";
import { assertUser } from "@/features/auth/server";
import { notEnoughSpendMessage } from "@/features/diary";
import { recordPurchase } from "@/features/diary/server";
import {
  completeCheckIn,
  completeMission,
  recordPractice,
  recordStep,
} from "@/features/learning/server";
import { pushAfterNotices } from "@/features/notifications/server";
import { AppError } from "@/lib";
import { json, withApi } from "@/lib/api";
import { type OutboxRequest, outboxRequestSchema } from "./schema";

export const maxDuration = 30;

/** A child sees this message, so it is the same calm wording as a refused 22023. */
const CHECK_INPUT = "Please check what you entered and try again.";

/** A minute inside the database's 7-day limit (22023 past it), so an older age still records. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 - 60_000;

/**
 * When the child did it, on the server clock. The device sends only the action's age, so a
 * device clock that is set wrong cannot push the time into the future or out of range.
 */
function occurredAtFrom(ageMs: number): string {
  return new Date(Date.now() - Math.min(ageMs, MAX_AGE_MS)).toISOString();
}

async function run(request: OutboxRequest, currency: string) {
  const occurredAt = occurredAtFrom(request.ageMs);
  switch (request.kind) {
    case "purchase": {
      const result = await recordPurchase({ ...request.payload, occurredAt });
      if (result.status === "not_enough_spend") {
        throw new AppError("CONFLICT", notEnoughSpendMessage(result.freeMinor, currency));
      }
      pushAfterNotices();
      return result;
    }
    case "practice":
      return recordPractice({ ...request.payload, occurredAt });
    case "step":
      return recordStep(request.payload);
    case "completeMission":
      return completeMission(request.payload.attemptId, occurredAt);
    case "checkIn":
      return completeCheckIn(request.payload.answers);
  }
}

/**
 * Takes one queued child action from the device outbox and runs it through the same feature
 * service (and its `assertRole("child")`) as the online form.
 */
export const POST = withApi(async (request: Request) => {
  const user = await assertUser();
  const body: unknown = await request.json().catch(() => {
    throw new AppError("VALIDATION", CHECK_INPUT);
  });
  // A stale tab of another child must not post into this child's jar.
  const userId = (body as { userId?: unknown } | null)?.userId;
  if (userId !== user.id) throw new AppError("UNAUTHORIZED", "Please sign in again.");

  const { currency } = await getFamilyContext();
  const parsed = outboxRequestSchema(currency).safeParse(body);
  if (!parsed.success) throw new AppError("VALIDATION", CHECK_INPUT);
  return json(await run(parsed.data, currency));
});
