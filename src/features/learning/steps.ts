import { parseMoney } from "@/lib";
import type { AnswerableStep, Phase, Step, StepAnswer, StepBody } from "./types";

/** Pure step helpers, safe in the browser (no content import, so no content in the bundle). */

export function isAnswerable(step: Step): step is AnswerableStep {
  return step.type !== "info";
}

export function answerableSteps(steps: readonly Step[]): AnswerableStep[] {
  return steps.filter(isAnswerable);
}

/** The body a step shows in a phase: its replay variant at the end of a mission, if it has one. */
export function bodyFor(step: AnswerableStep, phase: Phase): StepBody {
  const { key: _key, replay, ...body } = step;
  return phase === "replay" && replay ? (replay as StepBody) : (body as StepBody);
}

/** What the child has entered so far for one step. */
export type Draft =
  | { kind: "option"; optionId: string | null }
  | { kind: "number"; text: string }
  | { kind: "split"; save: number }
  | { kind: "sort"; placements: Record<string, string> }
  | { kind: "match"; pairs: Record<string, string> };

export function emptyDraft(body: StepBody): Draft {
  switch (body.type) {
    case "choice":
    case "predict":
    case "reason":
      return { kind: "option", optionId: null };
    case "amount":
      return { kind: "number", text: "" };
    case "split": {
      const half = Math.round(body.total / 2 / body.increment) * body.increment;
      return { kind: "split", save: half };
    }
    case "sort":
      return { kind: "sort", placements: {} };
    case "match":
      return { kind: "match", pairs: {} };
  }
}

/** The answer to submit, or null while the draft is incomplete or unreadable. */
export function draftToAnswer(body: StepBody, draft: Draft, currency: string): StepAnswer | null {
  switch (draft.kind) {
    case "option":
      return draft.optionId ? { kind: "option", optionId: draft.optionId } : null;
    case "number": {
      if (body.type !== "amount") return null;
      const text = draft.text.trim();
      if (!text) return null;
      if (body.unit === "money") {
        const minor = parseMoney(text, currency);
        return minor === null ? null : { kind: "number", value: minor };
      }
      return /^\d{1,6}$/.test(text) ? { kind: "number", value: Number(text) } : null;
    }
    case "split":
      return { kind: "split", save: draft.save };
    case "sort": {
      if (body.type !== "sort") return null;
      const complete = body.items.every((item) => draft.placements[item.id]);
      return complete ? { kind: "sort", placements: draft.placements } : null;
    }
    case "match": {
      if (body.type !== "match") return null;
      const complete = body.pairs.every((pair) => draft.pairs[pair.id]);
      return complete ? { kind: "match", pairs: draft.pairs } : null;
    }
  }
}

/** A stable shuffle (same order on the server and in the browser), seeded by a key. */
export function stableShuffle<T>(items: readonly T[], seed: string, id: (item: T) => string): T[] {
  const hash = (text: string) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  return [...items].sort((a, b) => hash(`${seed}:${id(a)}`) - hash(`${seed}:${id(b)}`));
}
