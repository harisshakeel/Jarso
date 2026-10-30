"use client";

import {
  BookOpenIcon,
  CircleCheckIcon,
  HourglassIcon,
  LightbulbIcon,
  RotateCcwIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { type ReactNode, type Ref, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import {
  newId,
  type OutboxKind,
  offlineCopy,
  runOnline,
  showsAsPending,
  submitToOutbox,
  useOnline,
  useOutbox,
} from "@/features/offline";
import { cn } from "@/lib";
import { describeAnswer, gradeStep } from "../grade";
import { attemptSummary, resumePosition, summaryLine } from "../journey";
import { startMissionAction } from "../server/actions";
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
type CheckInAnswer = { stepKey: string; answer: StepAnswer };

type MissionPlayerProps = {
  mode: PlayerMode;
  /** A mission's steps, or the answerable items of a practice set, the check-in or a topic. */
  steps: Step[];
  currency: string;
  /** The signed-in child: results wait in their device outbox when the connection drops. */
  userId: string;
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

/** Something to tell the child under the step. `calm` is a connection state, never red. */
type Problem = { text: string; calm: boolean };

/** Saved means sent, or stored on the device to send later (`data` is then null). */
type Saved = { ok: true; data: unknown } | { ok: false; problem: Problem };

const SAVE_FAILED = "We couldn't save that. Check your connection and try again.";

const PROGRESS_LABEL: Record<PlayerMode["kind"], string> = {
  mission: "Mission progress",
  practice: "Practice progress",
  "check-in": "Check-in progress",
  topic: "Practice progress",
};

function failureText(result: { error: { code: string; message: string } }): string {
  return result.error.code === "INTERNAL" ? SAVE_FAILED : result.error.message;
}

/**
 * Puts a result in the device outbox, which sends it straight away when it can and otherwise
 * later, oldest first. The payload is exactly the learning schema's input for that kind.
 */
async function save(userId: string, kind: OutboxKind, payload: unknown): Promise<Saved> {
  const result = await submitToOutbox({ userId, kind, payload, idempotencyKey: newId() });
  switch (result.status) {
    case "sent":
      return { ok: true, data: result.data };
    case "queued":
      return { ok: true, data: null };
    case "refused":
      return { ok: false, problem: { text: result.message, calm: false } };
    case "unsaved":
      return { ok: false, problem: { text: offlineCopy.offline, calm: true } };
  }
}

function initialQueue(mode: PlayerMode, steps: Step[], results: StepResult[]): Item[] {
  if (mode.kind !== "mission") return steps.map((step) => ({ step, phase: "main" as const }));
  const position = resumePosition({ steps }, results);
  if (position.phase === "main") {
    return steps.slice(position.index).map((step) => ({ step, phase: "main" as const }));
  }
  if (position.phase === "replay") return replayItems(steps, position.queue);
  return [];
}

function replayItems(steps: Step[], keys: string[]): Item[] {
  return keys.flatMap((key) => {
    const step = steps.find((s) => s.key === key);
    return step ? [{ step, phase: "replay" as const }] : [];
  });
}

/**
 * Plays a mission (FR06), a practice set (FR10 reviews), the starting check-in or a topic's
 * practice question. Each step is graded on the device for instant feedback; the server grades
 * it again when the result is saved. Wrong steps come back once at the end of a mission.
 */
export function MissionPlayer(props: MissionPlayerProps) {
  const { mode, steps, currency, userId, intro, doneHref, doneLabel, topicHref, stepAside } = props;
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
  const [checkInAnswers, setCheckInAnswers] = useState<CheckInAnswer[]>([]);
  const [finishText, setFinishText] = useState<{ heading: string; body: string } | null>(null);
  const [error, setError] = useState<Problem | null>(null);
  // Focus follows the child's own actions only: never on first load (it would scroll past a
  // topic's explanation).
  const [acted, setActed] = useState(false);
  const [pending, startTransition] = useTransition();
  const doneHeading = useRef<HTMLHeadingElement>(null);

  const resumed = mode.kind === "mission" && mode.attemptId !== null;
  const mainTotal = mode.kind === "mission" ? steps.length : queue.length;

  useEffect(() => {
    if (stage === "finished" || stage === "finishing") doneHeading.current?.focus();
  }, [stage]);

  function begin() {
    setError(null);
    setActed(true);
    if (mode.kind !== "mission" || attemptId) {
      // Every step was answered before the child left: just finish the mission.
      if (mode.kind === "mission" && queue.length === 0) finish(results, checkInAnswers, attemptId);
      else setStage("playing");
      return;
    }
    startTransition(async () => {
      // Starting needs the server (it creates the attempt), so it stays an online action.
      const result = await runOnline(() =>
        startMissionAction(null, { missionKey: mode.missionKey }),
      );
      if (!result.ok) {
        setError(
          result.error.code === "UNAVAILABLE"
            ? { text: result.error.message, calm: true }
            : { text: failureText(result), calm: false },
        );
        return;
      }
      const { attemptId: id, results: saved } = result.data;
      setAttemptId(id);
      setResults(saved);
      const nextQueue = initialQueue(mode, steps, saved);
      setQueue(nextQueue);
      setReplaysAdded(resumePosition({ steps }, saved).phase !== "main");
      setIndex(0);
      // Another tab may have answered every step already.
      if (nextQueue.length === 0) finish(saved, checkInAnswers, id);
      else setStage("playing");
    });
  }

  function finish(allResults: StepResult[], answers: CheckInAnswer[], id: string | null) {
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
        const saved = await save(userId, "checkIn", { answers });
        if (!saved.ok) {
          setError(saved.problem);
          return;
        }
        // Waiting to send: the device graded the same answers, so it can count them itself.
        const known =
          (saved.data as { correctCount: number } | null)?.correctCount ??
          allResults.filter((r) => r.correct).length;
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
      if (!id) {
        setError({ text: SAVE_FAILED, calm: false });
        return;
      }
      // Queued after this mission's steps, so the server never sees it before them.
      const saved = await save(userId, "completeMission", { attemptId: id });
      if (!saved.ok) {
        setError(saved.problem);
        return;
      }
      const summary =
        (saved.data as ReturnType<typeof attemptSummary> | null) ?? attemptSummary(allResults);
      setFinishText({ heading: "Mission done. Nice work.", body: summaryLine(summary) });
      setStage("finished");
    });
  }

  function advance(allResults: StepResult[], answers: CheckInAnswer[]) {
    setActed(true);
    const next = index + 1;
    if (next < queue.length) {
      setIndex(next);
      return;
    }
    if (mode.kind === "mission" && !replaysAdded) {
      const position = resumePosition({ steps }, allResults);
      setReplaysAdded(true);
      if (position.phase === "replay") {
        setQueue((current) => [...current, ...replayItems(steps, position.queue)]);
        setIndex(next);
        return;
      }
    }
    finish(allResults, answers, attemptId);
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
    // The player already graded the step on the device, so a result waiting to send doesn't
    // hold the child up: the next step comes straight away either way.
    const saved =
      mode.kind === "mission" && attemptId
        ? await save(userId, "step", {
            attemptId,
            stepKey: item.step.key,
            phase: item.phase,
            answer: outcome.answer,
            hintsUsed: outcome.hintsUsed,
            tries: outcome.tries,
          })
        : mode.kind === "practice"
          ? await save(userId, "practice", {
              itemKey: item.step.key,
              answer: outcome.answer,
              hintsUsed: outcome.hintsUsed,
              tries: outcome.tries,
            })
          : null;
    if (saved && !saved.ok) {
      setError(saved.problem);
      return false;
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
        <ProblemText problem={error} />
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
        <h1
          id="player-done"
          ref={doneHeading}
          tabIndex={-1}
          className="text-balance text-h1 outline-none"
        >
          {stage === "finished" && finishText ? finishText.heading : "Saving your answers…"}
        </h1>
        {stage === "finished" && finishText ? (
          <p className="text-ink-2">{finishText.body}</p>
        ) : null}
        <SavedOnDevice userId={userId} />
        {error ? (
          <div className="grid justify-items-center gap-3">
            <ProblemText problem={error} />
            <Button
              variant="outline"
              onClick={() => finish(results, checkInAnswers, attemptId)}
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
        label={PROGRESS_LABEL[mode.kind]}
        done={
          item.phase === "replay"
            ? mainTotal
            : mode.kind === "mission"
              ? steps.indexOf(item.step)
              : index
        }
        total={mainTotal}
      />
      <SavedOnDevice userId={userId} />
      {item.step.type === "info" ? (
        <InfoView
          key={`${item.phase}:${item.step.key}`}
          step={item.step}
          position={position}
          currency={currency}
          focusOnMount={acted}
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
          focusOnMount={acted}
          onDone={(outcome) => stepDone(item, outcome)}
        />
      )}
    </div>
  );
}

/** Shown while any of this child's results really wait on the device: offline, or a failed send. */
function SavedOnDevice({ userId }: { userId: string }) {
  const online = useOnline();
  const waiting = useOutbox(userId).some(
    (item) => item.status !== "needs_look" && showsAsPending(item, online),
  );
  if (!waiting) return null;
  return (
    <p className="flex items-center gap-1.5 text-ink-2 text-sm">
      <HourglassIcon aria-hidden className="size-4 shrink-0" />
      Saved on this device.
    </p>
  );
}

function ProblemText({ problem }: { problem: Problem | null }) {
  if (!problem) return null;
  return problem.calm ? (
    <p role="status" className="rounded-lg bg-muted px-3.5 py-2.5 text-ink-2 text-sm">
      {problem.text}
    </p>
  ) : (
    <p role="alert" className="font-semibold text-destructive">
      {problem.text}
    </p>
  );
}

function ProgressDots({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
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

/** Moves focus to the element when it mounts, if the child got here by acting. */
function useFocusOnMount<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: on mount only, by design
  useEffect(() => {
    if (enabled) ref.current?.focus();
  }, []);
  return ref;
}

function InfoView({
  step,
  position,
  currency,
  focusOnMount,
  onContinue,
}: {
  step: InfoStep;
  position: string;
  currency: string;
  focusOnMount: boolean;
  onContinue: () => void;
}) {
  const heading = useFocusOnMount<HTMLHeadingElement>(focusOnMount);
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
  error: Problem | null;
  focusOnMount: boolean;
  onDone: (outcome: StepOutcome) => Promise<boolean>;
};

type Outcome = { correct: boolean; feedback: string; final: boolean; tries: number };

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
  focusOnMount,
  onDone,
}: StepViewProps) {
  const idBase = `${item.phase}-${item.step.key}`;
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(body));
  const [wrongTries, setWrongTries] = useState(0);
  const [hintsShown, setHintsShown] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [saving, startSaving] = useTransition();
  const heading = useFocusOnMount<HTMLHeadingElement>(focusOnMount);
  const feedbackRef = useRef<HTMLDivElement>(null);
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

  function tryAgain() {
    setOutcome(null);
    // The Try again button goes away: put focus back on the question.
    heading.current?.focus();
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
        answer: outcome?.final ? answer : null,
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

        {/* Always in the page, so screen readers announce the feedback when it appears. */}
        <div role="status" aria-live="polite">
          {outcome ? (
            <Feedback
              ref={feedbackRef}
              outcome={outcome}
              body={body}
              currency={currency}
              topicHref={topicHref}
            />
          ) : null}
        </div>

        <ProblemText problem={error} />

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
            <Button variant="keycap" size="lg" onClick={tryAgain}>
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

function Feedback({
  ref,
  outcome,
  body,
  currency,
  topicHref,
}: {
  ref: Ref<HTMLDivElement>;
  outcome: Outcome;
  body: StepBody;
  currency: string;
  topicHref?: Route;
}) {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={cn(
        "grid gap-3 rounded-xl p-4 outline-none",
        outcome.correct
          ? "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100"
          : "bg-muted",
      )}
    >
      <h3 className="flex items-center gap-2 font-bold text-lg">
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
        <Link
          href={topicHref}
          className="inline-flex min-h-11 w-fit items-center font-semibold underline underline-offset-4"
        >
          Read about this topic
        </Link>
      ) : null}
    </div>
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
