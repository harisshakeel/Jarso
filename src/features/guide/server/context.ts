import "server-only";
import {
  type AnswerableStep,
  bodyFor,
  describeAnswer,
  renderText,
  type StepAnswer,
  type StepBody,
  topicTitles,
} from "@/features/learning";
import { findMission, findReviewItem, findTopic, topics } from "@/features/learning/server";
import { AppError, formatMoney } from "@/lib";
import type { GuideContextRef } from "../schemas";
import type { GuideEntry } from "../types";

/**
 * Turns what the browser sent (content keys only) into the context the guide sees, from
 * reviewed content. Nothing the child typed or the browser sent becomes context text, so the
 * context cannot carry instructions (spec §5.2).
 */
export type BuiltContext = {
  entry: GuideEntry;
  /** Stored on the conversation: keys only, never free text. */
  contextKey: string;
  /** The parent's list shows this, e.g. 'Help on "What's in Spend?"'. */
  label: string;
  /** The mid-conversation system message for the main call and the output screen. */
  text: string;
};

const NOT_FOUND = "We couldn't find that question.";

function findStep(ref: Extract<GuideContextRef, { entry: "step" | "why" }>): {
  step: AnswerableStep;
  where: string;
} {
  if (ref.source === "mission") {
    const mission = ref.missionKey ? findMission(ref.missionKey) : undefined;
    const step = mission?.steps.find(
      (s): s is AnswerableStep => s.key === ref.stepKey && s.type !== "info",
    );
    if (!mission || !step) throw new AppError("NOT_FOUND", NOT_FOUND);
    return { step, where: `the mission "${mission.title}"` };
  }
  if (ref.source === "practice") {
    const step = findReviewItem(ref.stepKey);
    if (!step) throw new AppError("NOT_FOUND", NOT_FOUND);
    return { step, where: "a practice question" };
  }
  const topic = topics.find((t) => t.practice.key === ref.stepKey);
  if (!topic) throw new AppError("NOT_FOUND", NOT_FOUND);
  return { step: topic.practice, where: `the practice question on the topic "${topic.title}"` };
}

function describeStep(body: StepBody, currency: string): string[] {
  const lines = [`Exercise: ${renderText(body.prompt, currency)}`];
  if (body.type === "choice" || body.type === "predict" || body.type === "reason") {
    lines.push(
      `Options: ${body.options.map((o, i) => `${i + 1}) ${renderText(o.text, currency)}`).join("; ")}`,
    );
  }
  if (body.type === "sort") {
    lines.push(
      `Groups: ${body.buckets.map((b) => b.label).join(" and ")}. Items: ${body.items.map((i) => renderText(i.text, currency)).join("; ")}`,
    );
  }
  if (body.type === "match") {
    lines.push(`Words to match: ${body.pairs.map((p) => p.term).join(", ")}`);
  }
  if (body.type === "split") {
    lines.push(
      `The child splits ${renderText(`{m:${body.total}}`, currency)} between Spend and Save with a slider.`,
    );
  }
  lines.push(`Right answer: ${describeAnswer(body, currency)}`);
  lines.push(
    `Authored hints: 1) ${renderText(body.hints[0], currency)} 2) ${renderText(body.hints[1], currency)}`,
  );
  return lines;
}

function describeChildAnswer(body: StepBody, answer: StepAnswer | null, currency: string): string {
  if (!answer) return "not recorded";
  if (answer.kind === "option" && "options" in body) {
    const option = body.options.find((o) => o.id === answer.optionId);
    return option ? renderText(option.text, currency) : "an option";
  }
  if (answer.kind === "number" && body.type === "amount") {
    return body.unit === "money"
      ? formatMoney(answer.value, currency, { showMinor: "nonzero" })
      : String(answer.value);
  }
  if (answer.kind === "split" && body.type === "split") {
    return `${formatMoney(answer.save, currency, { showMinor: "nonzero" })} to Save`;
  }
  return "their own sorting or matching";
}

export function buildContext(ref: GuideContextRef, currency: string): BuiltContext {
  const money = `The family's currency is ${currency}; write amounts like ${formatMoney(1250, currency)}.`;
  switch (ref.entry) {
    case "step": {
      const { step, where } = findStep(ref);
      const body = bodyFor(step, ref.phase);
      const finished = ref.wrongTries >= 2;
      return {
        entry: "step",
        contextKey: `step:${ref.source}:${ref.missionKey ?? "-"}:${step.key}:${ref.phase}`,
        label: `Help on ${where}`,
        text: [
          "Context from the app (not from the child):",
          money,
          `The child asked for help with an exercise in ${where}.`,
          ...describeStep(body, currency),
          `Tries so far: ${ref.wrongTries}.`,
          finished
            ? "The child has tried twice. You may explain the right answer and why."
            : "The child has not finished this exercise. Do not give the answer or say which option is right. Start with a guiding question, then a hint.",
        ].join("\n"),
      };
    }
    case "why": {
      const { step, where } = findStep(ref);
      const body = bodyFor(step, ref.phase);
      return {
        entry: "why",
        contextKey: `why:${ref.source}:${ref.missionKey ?? "-"}:${step.key}:${ref.phase}`,
        label: `Why? in ${where}`,
        text: [
          "Context from the app (not from the child):",
          money,
          `The child has finished an exercise in ${where} and asked why.`,
          ...describeStep(body, currency),
          `The child's answer: ${describeChildAnswer(body, ref.answer, currency)}.`,
          `Authored explanation: ${renderText(body.correct, currency)}`,
          "Explain kindly why the right answer is right, in your own words.",
        ].join("\n"),
      };
    }
    case "topic": {
      const topic = findTopic(ref.topicKey);
      if (!topic) throw new AppError("NOT_FOUND", NOT_FOUND);
      return {
        entry: "topic",
        contextKey: `topic:${topic.key}`,
        label: `Topic: ${topicTitles[topic.key]}`,
        text: [
          "Context from the app (not from the child):",
          money,
          `The child is reading the topic page "${topic.title}" (key ${topic.key}). Keep answers on this topic where you can.`,
        ].join("\n"),
      };
    }
    case "home":
      return {
        entry: "home",
        contextKey: "home",
        label: "Asked from Home",
        text: [
          "Context from the app (not from the child):",
          money,
          "The child opened the guide from their home screen.",
        ].join("\n"),
      };
  }
}
