"use client";

import type {
  AnswerableStep,
  InfoStep,
  Phase,
  Step,
  StepAnswer,
  StepBody,
  StepResult,
} from "@jarso/core/learning";
import {
  attemptSummary,
  bodyFor,
  coachFor,
  type Draft,
  describeAnswer,
  draftToAnswer,
  emptyDraft,
  gradeStep,
  playerCopy,
  pointsLine,
  praiseLine,
  renderText,
  resumePosition,
  totalPoints,
} from "@jarso/core/learning";
import {
  ArrowRightIcon,
  BookOpenIcon,
  CircleCheckIcon,
  HourglassIcon,
  LightbulbIcon,
  PlayIcon,
  RotateCcwIcon,
  StarIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
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
import { cn, playFanfare, playRight, playWrong, primeSounds } from "@/lib";
import { startMissionAction } from "../server/actions";
import { Blackboard } from "./blackboard";
import { CoachBubble } from "./coach-bubble";
import { type CurrentStep, CurrentStepContext, publishShownStep } from "./current-step";
import { filmScenes } from "./lesson-film/film-scenes";
import { primeFilmVoice } from "./lesson-film/film-voice";
import { LessonFilm } from "./lesson-film/lesson-film";
import { ReadAloudButton } from "./read-aloud-button";
import { StepInput } from "./step-inputs";
import { StepPictureView } from "./step-pictures";

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
  /** The animated intro (its narration lines): a mission's, or the check-in's. Plays on start. */
  film?: { lines: readonly string[] };
};

type StepOutcome = { answer: StepAnswer; correct: boolean; tries: number; hintsUsed: number };

/** Something to tell the child under the step. `calm` is a connection state, never red. */
type Problem = { text: string; calm: boolean };

/** Saved means sent, or stored on the device to send later (`data` is then null). */
type Saved = { ok: true; data: unknown } | { ok: false; problem: Problem };

const SAVE_FAILED = playerCopy.saveFailed;

const PROGRESS_LABEL: Record<PlayerMode["kind"], string> = playerCopy.progressLabel;

type Summary = ReturnType<typeof attemptSummary>;

function isSummary(data: unknown): data is Summary {
  if (!data || typeof data !== "object") return false;
  const { answerable, firstTry, hints } = data as Record<string, unknown>;
  return [answerable, firstTry, hints].every((n) => Number.isInteger(n));
}

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
    case "unsent":
      return { ok: false, problem: { text: offlineCopy.slow, calm: true } };
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
 * practice question. Each question sits on a blackboard with one of the four coaches beside it,
 * who hands out the hints and the feedback from a speech bubble. Each step is graded on the
 * device for instant feedback; the server grades it again when the result is saved. Wrong steps
 * come back once at the end of a mission.
 */
export function MissionPlayer(props: MissionPlayerProps) {
  const { mode, steps, currency, userId, intro, doneHref, doneLabel, topicHref, stepAside, film } =
    props;
  const initialResults = mode.kind === "mission" ? mode.results : [];
  const [stage, setStage] = useState<"intro" | "film" | "playing" | "finishing" | "finished">(
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
  // The film needs a scene drawn for this mission (or the check-in) and one line per beat.
  const filmKey =
    mode.kind === "mission" ? mode.missionKey : mode.kind === "check-in" ? "check-in" : null;
  const filmScene = filmKey ? filmScenes[filmKey] : undefined;
  const hasFilm = Boolean(film && filmScene && film.lines.length === filmScene.beats.length);
  const mainTotal = mode.kind === "mission" ? steps.length : queue.length;

  useEffect(() => {
    if (stage === "finished" || stage === "finishing") doneHeading.current?.focus();
  }, [stage]);

  // The chime and the bonk need the page to have been touched; listen from the start, so a
  // lesson opened straight from Learn plays them (browsers without `userActivation`).
  useEffect(() => {
    primeSounds();
  }, []);

  function begin() {
    setError(null);
    setActed(true);
    // A fresh start plays the film first; its voice must be unlocked inside this tap.
    const playFilm = hasFilm && !attemptId;
    if (playFilm) primeFilmVoice();
    if (mode.kind !== "mission" || attemptId) {
      // Every step was answered before the child left: just finish the mission.
      if (mode.kind === "mission" && queue.length === 0) finish(results, checkInAnswers, attemptId);
      else setStage(playFilm ? "film" : "playing");
      return;
    }
    startTransition(async () => {
      // Starting needs the server (it creates the attempt), so it stays an online action.
      const result = await runOnline(() =>
        startMissionAction(null, { missionKey: mode.missionKey }),
      );
      // After an await, updates leave the transition unless wrapped again (see rule-row.tsx).
      startTransition(() => {
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
        else setStage(playFilm && saved.length === 0 ? "film" : "playing");
      });
    });
  }

  function finish(allResults: StepResult[], answers: CheckInAnswer[], id: string | null) {
    setError(null);
    if (mode.kind === "practice") {
      const right = allResults.filter((r) => r.correct && r.tries === 1).length;
      setFinishText({
        heading: playerCopy.practiceDone,
        body: praiseLine({ answerable: allResults.length, firstTry: right }),
      });
      playFanfare();
      setStage("finished");
      return;
    }
    if (mode.kind === "topic") {
      setFinishText(playerCopy.topicDone);
      setStage("finished");
      return;
    }
    setStage("finishing");
    startTransition(async () => {
      if (mode.kind === "check-in") {
        const saved = await save(userId, "checkIn", { answers });
        // After an await, updates leave the transition unless wrapped again (see rule-row.tsx).
        startTransition(() => {
          if (!saved.ok) {
            setError(saved.problem);
            return;
          }
          // The intro promised no score, so the finish never counts the answers back.
          setFinishText(playerCopy.checkInDone);
          setStage("finished");
        });
        return;
      }
      if (!id) {
        setError({ text: SAVE_FAILED, calm: false });
        return;
      }
      // Queued after this mission's steps, so the server never sees it before them.
      const saved = await save(userId, "completeMission", { attemptId: id });
      startTransition(() => {
        if (!saved.ok) {
          setError(saved.problem);
          return;
        }
        const summary = isSummary(saved.data) ? saved.data : attemptSummary(allResults);
        setFinishText({ heading: playerCopy.missionDone, body: praiseLine(summary) });
        playFanfare();
        setStage("finished");
      });
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

  /** "Watch the intro" on a resumed mission's start card. */
  function watchFilm() {
    setError(null);
    setActed(true);
    primeFilmVoice();
    setStage("film");
  }

  /** After the film (watched to the end or skipped): on to the steps. */
  function afterFilm() {
    if (mode.kind === "mission" && queue.length === 0) finish(results, checkInAnswers, attemptId);
    else setStage("playing");
  }

  if (stage === "film" && film && filmScene && filmKey) {
    return (
      <LessonFilm
        missionKey={filmKey}
        title={intro?.heading ?? ""}
        lines={film.lines}
        scene={filmScene}
        onDone={afterFilm}
      />
    );
  }

  if (stage === "intro" && intro) {
    return (
      <section
        aria-labelledby="player-intro"
        className="rise-in grid gap-4 rounded-2xl bg-card p-6 shadow-raised"
      >
        <p className="eyebrow">{intro.eyebrow}</p>
        <h1 id="player-intro" className="text-balance text-h1">
          {resumed ? playerCopy.resumedHeading : intro.heading}
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
            ? playerCopy.continue
            : mode.kind === "check-in"
              ? playerCopy.startQuestions
              : playerCopy.startMission}
        </Button>
        {resumed && hasFilm ? (
          <Button variant="outline" size="lg" className="w-full sm:w-fit" onClick={watchFilm}>
            <PlayIcon aria-hidden />
            {playerCopy.film.watch}
          </Button>
        ) : null}
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
          {stage === "finished" && finishText ? finishText.heading : playerCopy.saving}
        </h1>
        {stage === "finished" && finishText ? (
          <p className="text-ink-2">{finishText.body}</p>
        ) : null}
        {stage === "finished" && mode.kind !== "check-in" && mode.kind !== "topic" ? (
          <p className="flex items-center gap-1.5 font-extrabold text-gold-text">
            <StarIcon aria-hidden className="size-5 fill-gold" />+{pointsLine(totalPoints(results))}
          </p>
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
              {playerCopy.tryAgain}
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
                {playerCopy.readTopic}
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
  // By key, not identity: a refresh hands down new step objects while the queue keeps the old ones.
  const stepIndex = steps.findIndex((s) => s.key === item.step.key);
  const position =
    item.phase === "replay"
      ? playerCopy.replayPosition(index - replayStart + 1, queue.length - replayStart)
      : mode.kind === "mission"
        ? playerCopy.stepPosition(stepIndex + 1, mainTotal)
        : queue.length === 1
          ? playerCopy.yourTurn
          : playerCopy.questionPosition(index + 1, queue.length);

  return (
    <div className="grid gap-4">
      <ProgressDots
        label={PROGRESS_LABEL[mode.kind]}
        done={item.phase === "replay" ? mainTotal : mode.kind === "mission" ? stepIndex : index}
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
      {playerCopy.savedOnDevice}
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
        {step.title ?? playerCopy.infoTitle}
      </h2>
      <p className="text-lg">{renderText(step.body, currency)}</p>
      {step.example ? (
        <p className="rounded-xl bg-secondary p-4 font-semibold">
          {renderText(step.example, currency)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="keycap" size="lg" className="w-full sm:w-fit" onClick={onContinue}>
          {playerCopy.continue}
        </Button>
        <ReadAloudButton
          text={[step.title ?? playerCopy.infoTitle, step.body, step.example ?? ""]
            .map((part) => renderText(part, currency))
            .join(". ")}
        />
      </div>
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

type Outcome = {
  correct: boolean;
  feedback: string;
  final: boolean;
  tries: number;
  /** What was checked, kept as it was (the draft may be cleared for another go). */
  answer: StepAnswer;
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
  focusOnMount,
  onDone,
}: StepViewProps) {
  const idBase = `${item.phase}-${item.step.key}`;
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(body));
  const [wrongTries, setWrongTries] = useState(0);
  const [hintsShown, setHintsShown] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // The last wrong try, kept through "Try again" so Jarso can say what was off about it.
  const [lastTry, setLastTry] = useState<StepAnswer | null>(null);
  const [saving, startSaving] = useTransition();
  const heading = useFocusOnMount<HTMLHeadingElement>(focusOnMount);
  const actionRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const answer = draftToAnswer(body, draft, currency);

  // After Check, focus goes to the one thing to do next ("Continue" or "Try again"), which also
  // brings it into view on a phone. The feedback is announced by the bubble's live region.
  useEffect(() => {
    if (outcome) actionRef.current?.focus();
  }, [outcome]);

  // A hint lands in the coach's bubble above the board: bring it into view, since the Hint
  // button is down by the answers and on a phone the bubble can be off screen.
  useEffect(() => {
    if (hintsShown > 0) bubbleRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [hintsShown]);

  const final = outcome?.final ?? false;
  const current = useMemo<CurrentStep>(
    () => ({
      source,
      missionKey,
      stepKey: item.step.key,
      phase: item.phase,
      wrongTries,
      hintsShown,
      lastTry: final ? null : lastTry,
      answered: final,
      answer: final && outcome ? outcome.answer : null,
    }),
    [source, missionKey, item, wrongTries, hintsShown, lastTry, final, outcome],
  );

  // Jarso's floating buddy reads the step on screen too, so asking it about "this question"
  // works the same as the "Help me" button beside it.
  useEffect(() => {
    publishShownStep(current);
  }, [current]);
  useEffect(() => () => publishShownStep(null), []);

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
      playRight();
      setOutcome({ correct: true, feedback: grade.feedback, final: true, tries, answer });
    } else {
      playWrong();
      setWrongTries(tries);
      setLastTry(answer);
      setOutcome({ correct: false, feedback: grade.feedback, final: tries >= 2, tries, answer });
    }
  }

  function tryAgain() {
    setOutcome(null);
    // A wrong pick left selected reads as still chosen: clear it for a fresh go. A typed
    // number, sorting, matching and the slider keep the child's work to adjust.
    if (draft.kind === "option") setDraft(emptyDraft(body));
    // The Try again button goes away: put focus back on the question.
    heading.current?.focus();
  }

  function continueOn() {
    if (!outcome) return;
    startSaving(async () => {
      await onDone({
        answer: outcome.answer,
        correct: outcome.correct,
        tries: outcome.tries,
        hintsUsed: hintsShown,
      });
    });
  }

  const locked = outcome !== null || saving;
  const hints = body.hints;
  // The same step always brings the same coach back, replay or refresh.
  const coach = coachFor(item.step.key);

  return (
    <CurrentStepContext.Provider value={current}>
      <section
        aria-labelledby={`${idBase}-prompt`}
        className={cn(
          "rise-in grid gap-5 rounded-2xl bg-card p-6 shadow-raised transition-shadow duration-300",
          // A right answer turns the card's edge green (design.md §2.4).
          outcome?.correct && "ring-2 ring-success",
        )}
      >
        <div ref={bubbleRef} className="scroll-mt-4">
          <CoachBubble
            coach={coach}
            // Once the step is settled the hints have done their job: the bubble is all feedback.
            hints={checkIn || final ? [] : hints.slice(0, hintsShown)}
            currency={currency}
            checkIn={checkIn}
            reaction={outcome ? (outcome.correct ? "cheer" : "nod") : null}
          >
            {outcome ? (
              <Feedback outcome={outcome} body={body} currency={currency} topicHref={topicHref} />
            ) : null}
          </CoachBubble>
        </div>

        <StepPictureView stepKey={item.step.key} prompt={body.prompt} currency={currency} />
        <Blackboard
          eyebrow={position}
          promptId={`${idBase}-prompt`}
          promptRef={heading}
          prompt={renderText(body.prompt, currency)}
          note={body.type === "predict" ? playerCopy.predictNote : undefined}
        />
        <ReadAloudButton
          className="w-fit"
          label={playerCopy.readAloud}
          text={[
            renderText(body.prompt, currency),
            body.type === "predict" ? playerCopy.predictNote : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />

        <StepInput
          body={body}
          draft={draft}
          onChange={setDraft}
          currency={currency}
          disabled={locked}
          idBase={idBase}
        />

        <ProblemText problem={error} />

        {outcome && !checkIn ? <ResultStrip outcome={outcome} /> : null}

        <div className="flex flex-wrap items-center gap-3">
          {!outcome ? (
            <Button variant="keycap" size="lg" onClick={check} disabled={!answer} loading={saving}>
              {checkIn ? playerCopy.next : playerCopy.check}
            </Button>
          ) : outcome.final ? (
            // Green after a right answer: done with this screen. Teal after the answer is shown.
            <Button
              ref={actionRef}
              variant={outcome.correct ? "keycap-success" : "keycap"}
              size="xl"
              className="w-full sm:w-fit"
              onClick={continueOn}
              loading={saving}
            >
              {playerCopy.continue}
              <ArrowRightIcon aria-hidden />
            </Button>
          ) : (
            // Warm gold and full width on a phone, so the way forward after a miss is obvious.
            <Button
              ref={actionRef}
              variant="keycap-gold"
              size="xl"
              className="w-full sm:w-fit"
              onClick={tryAgain}
            >
              <RotateCcwIcon aria-hidden />
              {playerCopy.tryAgain}
            </Button>
          )}
          {!checkIn && !outcome?.final && hintsShown < hints.length ? (
            <Button variant="outline" onClick={() => setHintsShown((n) => n + 1)}>
              <LightbulbIcon aria-hidden />
              {hintsShown === 0 ? playerCopy.hint : playerCopy.anotherHint}
            </Button>
          ) : null}
          {!checkIn ? stepAside : null}
        </div>
      </section>
    </CurrentStepContext.Provider>
  );
}

/**
 * One line by the buttons once an answer is checked: green for a right answer, warm gold for
 * a miss (never red, design.md §2.4). The bubble's live region already announces the feedback,
 * so this is hidden from screen readers.
 */
function ResultStrip({ outcome }: { outcome: Outcome }) {
  const Icon = outcome.correct ? CircleCheckIcon : outcome.final ? BookOpenIcon : RotateCcwIcon;
  return (
    <p
      aria-hidden
      className={cn(
        "rise-in flex items-center gap-2 rounded-xl px-4 py-3 font-bold",
        outcome.correct
          ? "bg-success-soft text-success-text"
          : "bg-tint-gold text-foreground [&>svg]:text-gold-text",
      )}
    >
      <Icon className="size-5 shrink-0" />
      {outcome.correct
        ? playerCopy.rightStrip
        : outcome.final
          ? playerCopy.finalStrip
          : playerCopy.againStrip}
    </p>
  );
}

function Feedback({
  ref,
  outcome,
  body,
  currency,
  topicHref,
}: {
  ref?: Ref<HTMLDivElement>;
  outcome: Outcome;
  body: StepBody;
  currency: string;
  topicHref?: Route;
}) {
  const heading = outcome.correct
    ? playerCopy.right
    : outcome.final
      ? playerCopy.final
      : playerCopy.again;
  const feedback = renderText(outcome.feedback, currency);
  const answerLine =
    outcome.final && !outcome.correct
      ? playerCopy.answerLine(describeAnswer(body, currency))
      : null;
  const predicted =
    outcome.final && body.type === "predict" ? renderText(body.outcome, currency) : null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={cn(
        "grid gap-3 rounded-xl p-4 outline-none",
        outcome.correct ? "bg-success-soft text-success-text" : "bg-card",
      )}
    >
      <h3 className="flex items-center gap-2 font-bold text-lg">
        {outcome.correct ? (
          <CircleCheckIcon aria-hidden className="size-6" />
        ) : (
          <LightbulbIcon aria-hidden className="size-6" />
        )}
        {heading}
      </h3>
      <p>{feedback}</p>
      {answerLine ? <p className="font-semibold">{answerLine}</p> : null}
      {predicted ? <p className="font-semibold">{predicted}</p> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ReadAloudButton
          className="w-fit"
          label={playerCopy.readFeedback}
          text={[heading, feedback, answerLine, predicted].filter(Boolean).join(" ")}
        />
        {!outcome.correct && topicHref ? (
          <Link
            href={topicHref}
            className="inline-flex min-h-11 w-fit items-center font-semibold underline underline-offset-4"
          >
            {playerCopy.readAboutTopic}
          </Link>
        ) : null}
      </div>
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
