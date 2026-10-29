"use client";

import { BookOpenIcon, CircleCheckIcon, LightbulbIcon, RotateCcwIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib";
import { describeAnswer, gradeStep } from "../grade";
import { resumePosition, summaryLine } from "../journey";
import {
  completeCheckInAction,
  completeMissionAction,
  recordPracticeAction,
  recordStepAction,
  startMissionAction,
} from "../server/actions";
import { bodyFor, type Draft, draftToAnswer, emptyDraft } from "../steps";
import { renderText } from "../text";
import type {
  AnswerableStep,
  InfoStep,
  Phase,
  Step,
  StepAnswer,
  StepBody,
  StepResult,
} from "../types";
import { CurrentStepContext } from "./current-step";
import { StepInput } from "./step-inputs";

export type PlayerMode =
  | { kind: "mission"; missionKey: string; attemptId: string | null; results: StepResult[] }
  | { kind: "practice" }
  | { kind: "check-in" }
  | { kind: "topic" };

type Item = { step: Step; phase: Phase };

type MissionPlayerProps = {
  mode: PlayerMode;
  /** A mission's steps, or the answerable items of a practice set, the check-in or a topic. */
  steps: Step[];
  currency: string;
  /** Start screen (missions and the check-in). */
  intro?: { eyebrow: string; heading: string; body: string };
  doneHref: Route;
  doneLabel: string;
  /** The topic page, offered after a wrong answer and on the finish screen. */
  topicHref?: Route;
  /** Helpers beside every step, such as the guide's "Help me"; they read useCurrentStep(). */
  stepAside?: ReactNode;
};

type StepOutcome = { answer: StepAnswer; correct: boolean; tries: number; hintsUsed: number };

const SAVE_FAILED = "We couldn't save that. Check your connection and try again.";

function initialQueue(mode: PlayerMode, steps: Step[], results: StepResult[]): Item[] {
  if (mode.kind !== "mission") return steps.map((step) => ({ step, phase: "main" as const }));
  const position = resumePosition({ steps }, results);
  if (position.phase === "main") {
    return steps.slice(position.index).map((step) => ({ step, phase: "main" as const }));
  }
  if (position.phase === "replay") {
    return position.queue.flatMap((key) => {
      const step = steps.find((s) => s.key === key);
      return step ? [{ step, phase: "replay" as const }] : [];
    });
  }
  return [];
}

/**
 * Plays a mission (FR06), a practice set (FR10 reviews), the starting check-in or a topic's
 * practice question. Each step is graded on the device for instant feedback; the server grades
 * it again when the result is saved. Wrong steps come back once at the end of a mission.
 */
export function MissionPlayer(props: MissionPlayerProps) {
  const { mode, steps, currency, intro, doneHref, doneLabel, topicHref, stepAside } = props;
  const initialResults = mode.kind === "mission" ? mode.results : [];
  const [stage, setStage] = useState<"intro" | "playing" | "finishing" | "finished">(
    intro ? "intro" : "playing",
  );
  const [attemptId, setAttemptId] = useState(mode.kind === "mission" ? mode.attemptId : null);
  const [results, setResults] = useState<StepResult[]>(initialResults);
  const [queue, setQueue] = useState<Item[]>(() => initialQueue(mode, steps, initialResults));
  const [replaysAdded, setReplaysAdded] = useState(
    () => mode.kind === "mission" && resumePosition({ steps }, initialResults).phase !== "main",
  );
  const [index, setIndex] = useState(0);
  const [checkInAnswers, setCheckInAnswers] = useState<{ stepKey: string; answer: StepAnswer }[]>(
    [],
  );
  const [finishText, setFinishText] = useState<{ heading: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const resumed = mode.kind === "mission" && mode.attemptId !== null;
  const mainTotal = mode.kind === "mission" ? steps.length : queue.length;

  function begin() {
    setError(null);
    if (mode.kind !== "mission" || attemptId) {
      // Every step was answered before the child left: just finish the mission.
      if (mode.kind === "mission" && queue.length === 0) finish(results, checkInAnswers);
      else setStage("playing");
      return;
    }
    startTransition(async () => {
      const result = await startMissionAction(null, { missionKey: mode.missionKey });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setAttemptId(result.data.attemptId);
      setResults(result.data.results);
      const nextQueue = initialQueue(mode, steps, result.data.results);
      setQueue(nextQueue);
      setReplaysAdded(resumePosition({ steps }, result.data.results).phase !== "main");
      setIndex(0);
      setStage("playing");
    });
  }

  function finish(allResults: StepResult[], answers: { stepKey: string; answer: StepAnswer }[]) {
    setError(null);
    if (mode.kind === "practice") {
      const right = allResults.filter((r) => r.correct && r.tries === 1).length;
      setFinishText({
        heading: "Practice done. Nicely kept fresh.",
        body: `${right} of ${allResults.length} first try.`,
      });
      setStage("finished");
      return;
    }
    if (mode.kind === "topic") {
      setFinishText({
        heading: "Nice. You've practised it.",
        body: "Opening a topic never changes your progress. Missions and practice do.",
      });
      setStage("finished");
      return;
    }
    setStage("finishing");
    startTransition(async () => {
      if (mode.kind === "check-in") {
        const result = await completeCheckInAction(null, { answers });
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        const known = result.data.correctCount;
        setFinishText({
          heading: "Thanks. That helps pick where you start.",
          body:
            known > 0
              ? `You already knew ${known} of 5. Mission 1 is a quick warm-up.`
              : "Mission 1 starts with the basics.",
        });
        setStage("finished");
        return;
      }
      if (!attemptId) return;
      const result = await completeMissionAction(null, { attemptId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setFinishText({ heading: "Mission done. Nice work.", body: summaryLine(result.data) });
      setStage("finished");
    });
  }

  function advance(allResults: StepResult[], answers: { stepKey: string; answer: StepAnswer }[]) {
    const next = index + 1;
    if (next < queue.length) {
      setIndex(next);
      return;
    }
    if (mode.kind === "mission" && !replaysAdded) {
      const position = resumePosition({ steps }, allResults);
      setReplaysAdded(true);
      if (position.phase === "replay") {
        const replays = position.queue.flatMap((key) => {
          const step = steps.find((s) => s.key === key);
          return step ? [{ step, phase: "replay" as const }] : [];
        });
        setQueue((current) => [...current, ...replays]);
        setIndex(next);
        return;
      }
    }
    finish(allResults, answers);
  }

  /** Saves a finished step (missions and practice) and moves on. False if saving failed. */
  async function stepDone(item: Item, outcome: StepOutcome | null): Promise<boolean> {
    setError(null);
    if (!outcome) {
      advance(results, checkInAnswers);
      return true;
    }
    const record: StepResult = {
      stepKey: item.step.key,
      phase: item.phase,
      correct: outcome.correct,
      hintsUsed: outcome.hintsUsed,
      tries: outcome.tries,
    };
    if (mode.kind === "mission" && attemptId) {
      const saved = await recordStepAction(null, {
        attemptId,
        stepKey: item.step.key,
        phase: item.phase,
        answer: outcome.answer,
        hintsUsed: outcome.hintsUsed,
        tries: outcome.tries,
      });
      if (!saved.ok) {
        setError(saved.error.code === "INTERNAL" ? SAVE_FAILED : saved.error.message);
        return false;
      }
    } else if (mode.kind === "practice") {
      const saved = await recordPracticeAction(null, {
        itemKey: item.step.key,
        answer: outcome.answer,
        hintsUsed: outcome.hintsUsed,
        tries: outcome.tries,
      });
      if (!saved.ok) {
        setError(saved.error.code === "INTERNAL" ? SAVE_FAILED : saved.error.message);
        return false;
      }
    }
    const allResults = [...results, record];
    const answers =
      mode.kind === "check-in"
        ? [...checkInAnswers, { stepKey: item.step.key, answer: outcome.answer }]
        : checkInAnswers;
    setResults(allResults);
    setCheckInAnswers(answers);
    advance(allResults, answers);
    return true;
  }

  if (stage === "intro" && intro) {
    return (
      <section
        aria-labelledby="player-intro"
        className="rise-in grid gap-4 rounded-2xl bg-card p-6 shadow-raised"
      >
        <p className="eyebrow">{intro.eyebrow}</p>
        <h1 id="player-intro" className="text-balance text-h1">
          {resumed ? "Pick up where you left off." : intro.heading}
        </h1>
        <p className="text-ink-2">{intro.body}</p>
        {error ? (
          <p role="alert" className="font-semibold text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          variant="keycap"
          size="lg"
          className="w-full sm:w-fit"
          onClick={begin}
          loading={pending}
        >
          {resumed
            ? "Continue"
            : mode.kind === "check-in"
              ? "Start the questions"
              : "Start mission"}
        </Button>
      </section>
    );
  }

  if (stage === "finishing" || stage === "finished") {
    return (
      <section
        aria-labelledby="player-done"
        className="grid justify-items-center gap-5 rounded-2xl bg-card p-6 text-center shadow-raised"
      >
        {stage === "finished" ? <DoneRing /> : null}
        <h1 id="player-done" tabIndex={-1} className="text-balance text-h1">
          {stage === "finished" && finishText ? finishText.heading : "Saving your answers…"}
        </h1>
        {stage === "finished" && finishText ? (
          <p className="text-ink-2">{finishText.body}</p>
        ) : null}
        {error ? (
          <div className="grid justify-items-center gap-3">
            <p role="alert" className="font-semibold text-destructive">
              {error}
            </p>
            <Button
              variant="outline"
              onClick={() => finish(results, checkInAnswers)}
              loading={pending}
            >
              <RotateCcwIcon aria-hidden />
              Try again
            </Button>
          </div>
        ) : null}
        {stage === "finished" ? (
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href={doneHref}
              className="keycap inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 font-bold text-primary-foreground"
            >
              {doneLabel}
            </Link>
            {topicHref && mode.kind === "mission" ? (
              <Link
                href={topicHref}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-hairline-strong px-5 font-bold"
              >
                <BookOpenIcon aria-hidden className="size-5" />
                Read the topic
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  const item = queue[index];
  if (!item) return null;
  const replayStart = queue.findIndex((i) => i.phase === "replay");
  const position =
    item.phase === "replay"
      ? `One more look: ${index - replayStart + 1} of ${queue.length - replayStart}`
      : mode.kind === "mission"
        ? `Step ${steps.indexOf(item.step) + 1} of ${mainTotal}`
        : `Question ${index + 1} of ${queue.length}`;

  return (
    <div className="grid gap-4">
      <ProgressDots
        done={
          item.phase === "replay"
            ? mainTotal
            : mode.kind === "mission"
              ? steps.indexOf(item.step)
              : index
        }
        total={mainTotal}
      />
      {item.step.type === "info" ? (
        <InfoView
          key={`${item.phase}:${item.step.key}`}
          step={item.step}
          position={position}
          currency={currency}
          onContinue={() => stepDone(item, null)}
        />
      ) : (
        <StepView
          key={`${item.phase}:${item.step.key}`}
          item={item}
          body={bodyFor(item.step as AnswerableStep, item.phase)}
          position={position}
          currency={currency}
          checkIn={mode.kind === "check-in"}
          source={mode.kind}
          missionKey={mode.kind === "mission" ? mode.missionKey : null}
          topicHref={topicHref}
          stepAside={stepAside}
          error={error}
          onDone={(outcome) => stepDone(item, outcome)}
        />
      )}
    </div>
  );
}

function ProgressDots({ done, total }: { done: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-label="Mission progress"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(done, total)}
      className="flex gap-1.5"
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decoration
          key={i}
          className={cn("h-2 flex-1 rounded-full", i < done ? "bg-primary" : "bg-muted")}
        />
      ))}
    </div>
  );
}

function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

function InfoView({
  step,
  position,
  currency,
  onContinue,
}: {
  step: InfoStep;
  position: string;
  currency: string;
  onContinue: () => void;
}) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <section
      aria-labelledby={`info-${step.key}`}
      className="rise-in grid gap-4 rounded-2xl bg-card p-6 shadow-raised"
    >
      <p className="eyebrow">{position}</p>
      <h2
        id={`info-${step.key}`}
        ref={heading}
        tabIndex={-1}
        className="text-balance text-h2 outline-none"
      >
        {step.title ?? "Here's the idea"}
      </h2>
      <p className="text-lg">{renderText(step.body, currency)}</p>
      {step.example ? (
        <p className="rounded-xl bg-secondary p-4 font-semibold">
          {renderText(step.example, currency)}
        </p>
      ) : null}
      <Button variant="keycap" size="lg" className="w-full sm:w-fit" onClick={onContinue}>
        Continue
      </Button>
    </section>
  );
}

type StepViewProps = {
  item: Item;
  body: StepBody;
  position: string;
  currency: string;
  checkIn: boolean;
  source: PlayerMode["kind"];
  missionKey: string | null;
  topicHref?: Route;
  stepAside?: ReactNode;
  error: string | null;
  onDone: (outcome: StepOutcome) => Promise<boolean>;
};

function StepView({
  item,
  body,
  position,
  currency,
  checkIn,
  source,
  missionKey,
  topicHref,
  stepAside,
  error,
  onDone,
}: StepViewProps) {
  const idBase = `${item.phase}-${item.step.key}`;
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(body));
  const [wrongTries, setWrongTries] = useState(0);
  const [hintsShown, setHintsShown] = useState(0);
  const [outcome, setOutcome] = useState<{
    correct: boolean;
    feedback: string;
    final: boolean;
    tries: number;
  } | null>(null);
  const [saving, startSaving] = useTransition();
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const feedbackRef = useRef<HTMLHeadingElement>(null);
  const answer = draftToAnswer(body, draft, currency);

  useEffect(() => {
    if (outcome) feedbackRef.current?.focus();
  }, [outcome]);

  function check() {
    if (!answer) return;
    const grade = gradeStep(body, answer);
    if (checkIn) {
      // The check-in places, it doesn't test: no right or wrong is shown.
      startSaving(async () => {
        await onDone({ answer, correct: grade.correct, tries: 1, hintsUsed: 0 });
      });
      return;
    }
    const tries = wrongTries + 1;
    if (grade.correct) {
      setOutcome({ correct: true, feedback: grade.feedback, final: true, tries });
    } else {
      setWrongTries(tries);
      setOutcome({ correct: false, feedback: grade.feedback, final: tries >= 2, tries });
    }
  }

  function continueOn() {
    if (!outcome || !answer) return;
    startSaving(async () => {
      await onDone({
        answer,
        correct: outcome.correct,
        tries: outcome.tries,
        hintsUsed: hintsShown,
      });
    });
  }

  const locked = outcome !== null || saving;
  const hints = body.hints;

  return (
    <CurrentStepContext.Provider
      value={{
        source,
        missionKey,
        stepKey: item.step.key,
        phase: item.phase,
        wrongTries,
        answered: outcome?.final ?? false,
      }}
    >
      <section
        aria-labelledby={`${idBase}-prompt`}
        className="rise-in grid gap-5 rounded-2xl bg-card p-6 shadow-raised"
      >
        <div className="grid gap-2">
          <p className="eyebrow">{position}</p>
          <h2
            id={`${idBase}-prompt`}
            ref={heading}
            tabIndex={-1}
            className="text-balance text-h2 outline-none"
          >
            {renderText(body.prompt, currency)}
          </h2>
          {body.type === "predict" ? (
            <p className="text-ink-2">What do you think happens?</p>
          ) : null}
        </div>

        <StepInput
          body={body}
          draft={draft}
          onChange={setDraft}
          currency={currency}
          disabled={locked}
          idBase={idBase}
        />

        {!checkIn && hintsShown > 0 ? (
          <ul className="grid gap-2" aria-label="Hints">
            {hints.slice(0, hintsShown).map((hint) => (
              <li
                key={hint}
                className="flex gap-2 rounded-xl bg-gold-100 p-3 text-gold-700 dark:bg-gold-900 dark:text-gold"
              >
                <LightbulbIcon aria-hidden className="mt-0.5 size-5 shrink-0" />
                <span className="font-semibold">{renderText(hint, currency)}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {outcome ? (
          <div
            role="status"
            className={cn(
              "grid gap-3 rounded-xl p-4",
              outcome.correct
                ? "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100"
                : "bg-muted",
            )}
          >
            <h3
              ref={feedbackRef}
              tabIndex={-1}
              className="flex items-center gap-2 font-bold text-lg outline-none"
            >
              {outcome.correct ? (
                <CircleCheckIcon aria-hidden className="size-6" />
              ) : (
                <LightbulbIcon aria-hidden className="size-6" />
              )}
              {outcome.correct
                ? "That's it."
                : outcome.final
                  ? "Here's how it works."
                  : "Have another go."}
            </h3>
            <p>{renderText(outcome.feedback, currency)}</p>
            {outcome.final && !outcome.correct ? (
              <p className="font-semibold">The answer: {describeAnswer(body, currency)}.</p>
            ) : null}
            {outcome.final && body.type === "predict" ? (
              <p className="font-semibold">{renderText(body.outcome, currency)}</p>
            ) : null}
            {!outcome.correct && topicHref ? (
              <Link href={topicHref} className="w-fit font-semibold underline underline-offset-4">
                Read about this topic
              </Link>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="font-semibold text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {!outcome ? (
            <Button variant="keycap" size="lg" onClick={check} disabled={!answer} loading={saving}>
              {checkIn ? "Next" : "Check"}
            </Button>
          ) : outcome.final ? (
            <Button variant="keycap" size="lg" onClick={continueOn} loading={saving}>
              Continue
            </Button>
          ) : (
            <Button variant="keycap" size="lg" onClick={() => setOutcome(null)}>
              Try again
            </Button>
          )}
          {!checkIn && !outcome?.final && hintsShown < hints.length ? (
            <Button variant="outline" onClick={() => setHintsShown((n) => n + 1)}>
              <LightbulbIcon aria-hidden />
              {hintsShown === 0 ? "Hint" : "Another hint"}
            </Button>
          ) : null}
          {!checkIn ? stepAside : null}
        </div>
      </section>
    </CurrentStepContext.Provider>
  );
}

/** Mission complete: the ring closes and the badge scales in once (design.md §8). */
function DoneRing() {
  return (
    <div className="relative grid size-24 place-items-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="44" fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          className="stroke-gold motion-safe:animate-[ring-close_600ms_var(--ease-brand)_both]"
        />
      </svg>
      <CircleCheckIcon
        aria-hidden
        className="size-12 text-primary motion-safe:animate-[badge-in_600ms_var(--ease-brand)_both]"
      />
    </div>
  );
}
