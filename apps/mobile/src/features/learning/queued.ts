import type { Step, StepAnswer, StepResult } from "@jarso/core/learning";
import { bodyFor, gradeStep, isAnswerable } from "@jarso/core/learning";
import type { OutboxItem } from "@jarso/core/offline";

type StepPayload = {
  attemptId: string;
  stepKey: string;
  phase: "main" | "replay";
  answer: StepAnswer;
  hintsUsed: number;
  tries: number;
};

function stepPayload(item: OutboxItem, attemptId: string): StepPayload | null {
  if (item.kind !== "step" || item.status === "needs_look") return null;
  const payload = item.payload as Partial<StepPayload> | null;
  if (!payload || payload.attemptId !== attemptId) return null;
  if (typeof payload.stepKey !== "string" || !payload.answer) return null;
  if (payload.phase !== "main" && payload.phase !== "replay") return null;
  return payload as StepPayload;
}

/**
 * The attempt's results as the child left them: the server's, plus the steps still waiting in
 * the phone's outbox (app killed, offline). A queued step is graded again on the device, as when
 * it was answered, so a restart never asks it twice. A step the server refused (needs a look)
 * isn't counted: it was not recorded, so the child answers it again.
 */
export function withQueuedSteps(
  results: readonly StepResult[],
  items: readonly OutboxItem[],
  attemptId: string | null,
  steps: readonly Step[],
): StepResult[] {
  if (!attemptId) return [...results];
  const merged = [...results];
  const seen = new Set(results.map((r) => `${r.phase}:${r.stepKey}`));
  for (const item of items) {
    const payload = stepPayload(item, attemptId);
    if (!payload) continue;
    const id = `${payload.phase}:${payload.stepKey}`;
    const step = steps.find((s) => s.key === payload.stepKey);
    if (seen.has(id) || !step || !isAnswerable(step)) continue;
    seen.add(id);
    merged.push({
      stepKey: payload.stepKey,
      phase: payload.phase,
      correct: gradeStep(bodyFor(step, payload.phase), payload.answer).correct,
      hintsUsed: payload.hintsUsed,
      tries: payload.tries,
    });
  }
  return merged;
}

/** A finish for this attempt already waits on the phone: don't queue a second one. */
export function finishQueued(items: readonly OutboxItem[], attemptId: string): boolean {
  return items.some(
    (item) =>
      item.kind === "completeMission" &&
      item.status !== "needs_look" &&
      (item.payload as { attemptId?: unknown } | null)?.attemptId === attemptId,
  );
}
