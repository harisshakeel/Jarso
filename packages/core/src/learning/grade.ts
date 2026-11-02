import { renderText } from "./text";
import type { Grade, StepAnswer, StepBody } from "./types";

/**
 * Grades one answer. Pure and shared: the player grades on the device for instant feedback and
 * the server grades again before recording, so a result is never taken on the client's word.
 * A wrong answer of the wrong kind (a number for a choice step) is simply wrong.
 */
export function gradeStep(step: StepBody, answer: StepAnswer): Grade {
  switch (step.type) {
    case "choice":
    case "predict":
    case "reason": {
      if (answer.kind !== "option") return { correct: false, feedback: step.hints[0] };
      if (answer.optionId === step.answer) return { correct: true, feedback: step.correct };
      const chosen = step.options.find((o) => o.id === answer.optionId);
      return { correct: false, feedback: chosen?.feedback ?? step.hints[0] };
    }
    case "amount": {
      if (answer.kind !== "number") return { correct: false, feedback: step.wrong };
      if (answer.value === step.answer) return { correct: true, feedback: step.correct };
      const known = step.misconceptions.find((m) => m.value === answer.value);
      return { correct: false, feedback: known?.feedback ?? step.wrong };
    }
    case "split": {
      if (answer.kind !== "split" || answer.save > step.total)
        return { correct: false, feedback: step.wrong };
      return splitMeetsRule(step, answer.save)
        ? { correct: true, feedback: step.correct }
        : { correct: false, feedback: step.wrong };
    }
    case "sort": {
      if (answer.kind !== "sort") return { correct: false, feedback: step.wrong };
      const allRight = step.items.every((item) => answer.placements[item.id] === item.bucket);
      return allRight
        ? { correct: true, feedback: step.correct }
        : { correct: false, feedback: step.wrong };
    }
    case "match": {
      if (answer.kind !== "match") return { correct: false, feedback: step.wrong };
      const allRight = step.pairs.every((pair) => answer.pairs[pair.id] === pair.id);
      return allRight
        ? { correct: true, feedback: step.correct }
        : { correct: false, feedback: step.wrong };
    }
  }
}

export function splitMeetsRule(step: Extract<StepBody, { type: "split" }>, save: number): boolean {
  const { minSave, maxSave, exactSave } = step.rule;
  if (exactSave !== undefined && save !== exactSave) return false;
  if (minSave !== undefined && save < minSave) return false;
  if (maxSave !== undefined && save > maxSave) return false;
  return true;
}

/** The right answer in words, shown after the second wrong try. */
export function describeAnswer(step: StepBody, currency: string): string {
  const money = (minor: number) => renderText(`{m:${minor}}`, currency);
  switch (step.type) {
    case "choice":
    case "predict":
    case "reason":
      return renderText(step.options.find((o) => o.id === step.answer)?.text ?? "", currency);
    case "amount":
      return step.unit === "money"
        ? money(step.answer)
        : `${step.answer.toLocaleString("en")}${step.suffix ? ` ${step.suffix}` : ""}`;
    case "split": {
      const { minSave, maxSave, exactSave } = step.rule;
      if (exactSave !== undefined)
        return `${money(exactSave)} to Save and ${money(step.total - exactSave)} to Spend`;
      if (minSave !== undefined && maxSave !== undefined)
        return `between ${money(minSave)} and ${money(maxSave)} to Save`;
      if (minSave !== undefined) return `at least ${money(minSave)} to Save`;
      return `at most ${money(maxSave ?? 0)} to Save`;
    }
    case "sort":
      return step.buckets
        .map((bucket) => {
          const items = step.items
            .filter((i) => i.bucket === bucket.id)
            .map((i) => renderText(i.text, currency));
          return `${bucket.label}: ${items.join(", ")}`;
        })
        .join(". ");
    case "match":
      return step.pairs.map((p) => `${p.term}: ${renderText(p.meaning, currency)}`).join(". ");
  }
}

/** Whether a step needs to come back at the end of the mission: not right on the first try. */
export function needsReplay(result: { correct: boolean; tries: number }): boolean {
  return !(result.correct && result.tries === 1);
}
