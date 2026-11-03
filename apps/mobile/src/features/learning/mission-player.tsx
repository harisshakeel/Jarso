import { palette } from "@jarso/brand/tokens";
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
  type Coach,
  coachFor,
  type Draft,
  describeAnswer,
  draftToAnswer,
  emptyDraft,
  gradeStep,
  playerCopy,
  praiseLine,
  renderText,
  resumePosition,
} from "@jarso/core/learning";
import { type OutboxKind, offlineCopy, showsAsPending } from "@jarso/core/offline";
import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import * as Haptics from "expo-haptics";
import { type Href, useRouter } from "expo-router";
import {
  BookOpenIcon,
  CircleCheckIcon,
  HourglassIcon,
  LightbulbIcon,
  RotateCcwIcon,
} from "lucide-react-native";
import { type ReactNode, useRef, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Button, Text } from "@/components/ui";
import { cn, isAppError, useTokens } from "@/lib";
import { outboxPlatform, submit, useOnline, useOutboxItems } from "@/lib/outbox";
import { CurrentStepContext } from "./current-step";
import { finishQueued } from "./queued";
import { StepInput } from "./step-views";
import { type MissionSessionView, useStartMission } from "./use-learning";

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
  /** The signed-in child: results wait in their phone outbox when the connection drops. */
  userId: string;
  /** Start screen (missions and the check-in). */
  intro?: { eyebrow: string; heading: string; body: string };
  doneHref: Href;
  doneLabel: string;
  /** The topic page, offered after a wrong answer and on the finish screen. */
  topicHref?: Href;
  /** Helpers beside every step, such as the guide's "Help me"; they read useCurrentStep(). */
  stepAside?: ReactNode;
};

type StepOutcome = { answer: StepAnswer; correct: boolean; tries: number; hintsUsed: number };

/** Something to tell the child under the step. `calm` is a connection state, never red. */
type Problem = { text: string; calm: boolean };

/** Saved means sent, or stored on the phone to send later (`data` is then null). */
type Saved = { ok: true; data: unknown } | { ok: false; problem: Problem };

type Summary = ReturnType<typeof attemptSummary>;

function isSummary(data: unknown): data is Summary {
  if (!data || typeof data !== "object") return false;
  const { answerable, firstTry, hints } = data as Record<string, unknown>;
  return [answerable, firstTry, hints].every((n) => Number.isInteger(n));
}

/**
 * Puts a result in the phone's outbox, which sends it to /api/v1/outbox straight away when it can
 * and otherwise later, oldest first. The payload is exactly the learning schema's input for that
 * kind; the server grades it again. Never calls a learning RPC directly.
 */
async function save(userId: string, kind: OutboxKind, payload: unknown): Promise<Saved> {
  const result = await submit({ userId, kind, payload, idempotencyKey: randomUUID() });
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

/** A mission's finish, unless one for this attempt already waits on the phone. */
async function saveFinish(userId: string, attemptId: string): Promise<Saved> {
  const store = await outboxPlatform.openStore();
  const items = (await store?.listForUser(userId).catch(() => [])) ?? [];
  if (finishQueued(items, attemptId)) return { ok: true, data: null };
  return save(userId, "completeMission", { attemptId });
}

function replayItems(steps: Step[], keys: string[]): Item[] {
  return keys.flatMap((key) => {
    const step = steps.find((s) => s.key === key);
    return step ? [{ step, phase: "replay" as const }] : [];
  });
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

function startProblem(error: unknown): Problem {
  if (isAppError(error) && error.code === "UNAVAILABLE") return { text: error.message, calm: true };
  if (isAppError(error) && error.code !== "INTERNAL") return { text: error.message, calm: false };
  return { text: playerCopy.saveFailed, calm: false };
}

/**
 * The phone's twin of the web's MissionPlayer: a mission (FR06), a practice set (FR10), the
 * starting check-in or a topic's question, one step per screen. Each step is graded on the phone
 * for instant feedback (a haptic on a right answer); every result goes through the outbox and the
 * server grades it again. Wrong steps come back once at the end of a mission. A topic saves
 * nothing.
 */
export function MissionPlayer(props: MissionPlayerProps) {
  const { mode, steps, currency, userId, intro, doneHref, doneLabel, topicHref, stepAside } = props;
  const router = useRouter();
  const tokens = useTokens();
  const queryClient = useQueryClient();
  const start = useStartMission();
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
  const [pending, setPending] = useState(false);

  const resumed = mode.kind === "mission" && mode.attemptId !== null;
  const mainTotal = mode.kind === "mission" ? steps.length : queue.length;

  function finished(text: { heading: string; body: string }) {
    setFinishText(text);
    setStage("finished");
    // Learn, Home's next step and the week read the new progress.
    void queryClient.invalidateQueries({ queryKey: ["learning", userId] });
  }

  function applyStart(session: MissionSessionView) {
    setAttemptId(session.attemptId);
    setResults(session.results);
    const nextQueue = initialQueue(mode, steps, session.results);
    setQueue(nextQueue);
    setReplaysAdded(resumePosition({ steps }, session.results).phase !== "main");
    setIndex(0);
    // Another device may have answered every step already.
    if (nextQueue.length === 0) void finish(session.results, checkInAnswers, session.attemptId);
    else setStage("playing");
  }

  function begin() {
    setError(null);
    if (mode.kind !== "mission" || attemptId) {
      // Every step was answered before the child left: just finish the mission.
      if (mode.kind === "mission" && queue.length === 0) {
        void finish(results, checkInAnswers, attemptId);
      } else setStage("playing");
      return;
    }
    // Starting needs the server (it creates the attempt), so it stays an online action.
    start.mutate(mode.missionKey, {
      onSuccess: applyStart,
      onError: (cause) => setError(startProblem(cause)),
    });
  }

  async function finish(allResults: StepResult[], answers: CheckInAnswer[], id: string | null) {
    setError(null);
    if (mode.kind === "practice") {
      const right = allResults.filter((r) => r.correct && r.tries === 1).length;
      finished({
        heading: playerCopy.practiceDone,
        body: praiseLine({ answerable: allResults.length, firstTry: right }),
      });
      return;
    }
    if (mode.kind === "topic") {
      // Opening a topic never changes progress: nothing is saved.
      setFinishText(playerCopy.topicDone);
      setStage("finished");
      return;
    }
    setStage("finishing");
    setPending(true);
    try {
      if (mode.kind === "check-in") {
        const saved = await save(userId, "checkIn", { answers });
        if (!saved.ok) return setError(saved.problem);
        // The intro promised no score, so the finish never counts the answers back.
        finished(playerCopy.checkInDone);
        return;
      }
      if (!id) return setError({ text: playerCopy.saveFailed, calm: false });
      // Queued after this mission's steps, so the server never sees it before them.
      const saved = await saveFinish(userId, id);
      if (!saved.ok) return setError(saved.problem);
      const summary = isSummary(saved.data) ? saved.data : attemptSummary(allResults);
      finished({ heading: playerCopy.missionDone, body: praiseLine(summary) });
    } finally {
      setPending(false);
    }
  }

  function advance(allResults: StepResult[], answers: CheckInAnswer[]) {
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
    void finish(allResults, answers, attemptId);
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
    // Graded on the phone already, so a result waiting to send doesn't hold the child up.
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
      <View className="gap-4 rounded-2xl bg-card p-5">
        <Text className="font-sans-bold text-muted-foreground text-caption uppercase">
          {intro.eyebrow}
        </Text>
        <Text accessibilityRole="header" className="font-sans-extrabold text-h2">
          {resumed ? playerCopy.resumedHeading : intro.heading}
        </Text>
        <Text className="text-muted-foreground">{intro.body}</Text>
        <ProblemText problem={error} />
        <PrimaryButton
          label={
            resumed
              ? playerCopy.continue
              : mode.kind === "check-in"
                ? playerCopy.startQuestions
                : playerCopy.startMission
          }
          pending={start.isPending}
          onPress={begin}
        />
      </View>
    );
  }

  if (stage === "finishing" || stage === "finished") {
    const done = stage === "finished" && finishText;
    return (
      <View className="items-center gap-5 rounded-2xl bg-card p-5">
        {done ? <DoneBadge /> : null}
        <Text
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          className="text-center font-sans-extrabold text-h2"
        >
          {done ? finishText.heading : playerCopy.saving}
        </Text>
        {done ? <Text className="text-center text-muted-foreground">{finishText.body}</Text> : null}
        <SavedOnDevice userId={userId} />
        {error ? (
          <View className="items-center gap-3">
            <ProblemText problem={error} />
            <Button
              variant="outline"
              accessibilityLabel={playerCopy.tryAgain}
              disabled={pending}
              onPress={() => void finish(results, checkInAnswers, attemptId)}
            >
              <RotateCcwIcon size={18} color={tokens.foreground} />
              <Text>{playerCopy.tryAgain}</Text>
            </Button>
          </View>
        ) : null}
        {done ? (
          <View className="w-full gap-3">
            <PrimaryButton
              label={doneLabel}
              pending={false}
              onPress={() => router.dismissTo(doneHref)}
            />
            {topicHref && mode.kind === "mission" ? (
              <Button
                variant="outline"
                size="lg"
                accessibilityLabel={playerCopy.readTopic}
                onPress={() => router.push(topicHref)}
              >
                <BookOpenIcon size={20} color={tokens.foreground} />
                <Text>{playerCopy.readTopic}</Text>
              </Button>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  const item = queue[index];
  if (!item) return null;
  const replayStart = queue.findIndex((i) => i.phase === "replay");
  // By key, not identity: a refetch hands down new step objects while the queue keeps the old ones.
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
    <View className="gap-4">
      <ProgressDots
        label={playerCopy.progressLabel[mode.kind]}
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
          onContinue={() => void stepDone(item, null)}
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
    </View>
  );
}

function PrimaryButton({
  label,
  pending,
  onPress,
}: {
  label: string;
  pending: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      size="lg"
      accessibilityLabel={label}
      accessibilityState={{ busy: pending, disabled: pending }}
      disabled={pending}
      onPress={onPress}
    >
      {pending ? <ActivityIndicator color="white" /> : <Text>{label}</Text>}
    </Button>
  );
}

/** Shown while any of this child's results really wait on the phone: offline, or a failed send. */
function SavedOnDevice({ userId }: { userId: string }) {
  const online = useOnline();
  const tokens = useTokens();
  const waiting = useOutboxItems(userId).some(
    (item) => item.status !== "needs_look" && showsAsPending(item, online),
  );
  if (!waiting) return null;
  return (
    <View className="flex-row items-center gap-1.5">
      <HourglassIcon size={16} color={tokens["muted-foreground"]} />
      <Text className="text-muted-foreground">{playerCopy.savedOnDevice}</Text>
    </View>
  );
}

function ProblemText({ problem }: { problem: Problem | null }) {
  if (!problem) return null;
  return problem.calm ? (
    <Text
      accessibilityLiveRegion="polite"
      className="rounded-lg bg-muted px-3.5 py-2.5 text-muted-foreground"
    >
      {problem.text}
    </Text>
  ) : (
    <Text accessibilityRole="alert" className="font-sans-semibold text-destructive">
      {problem.text}
    </Text>
  );
}

function ProgressDots({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: total, now: Math.min(done, total) }}
      className="flex-row gap-1.5"
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decoration
          key={i}
          className={cn("h-2 flex-1 rounded-full", i < done ? "bg-primary" : "bg-muted")}
        />
      ))}
    </View>
  );
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
  return (
    <View className="gap-4 rounded-2xl bg-card p-5">
      <Text className="font-sans-bold text-muted-foreground text-caption uppercase">
        {position}
      </Text>
      <Text accessibilityRole="header" className="font-sans-extrabold text-h2">
        {step.title ?? playerCopy.infoTitle}
      </Text>
      <Text>{renderText(step.body, currency)}</Text>
      {step.example ? (
        <Text className="rounded-xl bg-secondary p-4 font-sans-semibold text-secondary-foreground">
          {renderText(step.example, currency)}
        </Text>
      ) : null}
      <PrimaryButton label={playerCopy.continue} pending={false} onPress={onContinue} />
    </View>
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
  topicHref?: Href;
  stepAside?: ReactNode;
  error: Problem | null;
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
  onDone,
}: StepViewProps) {
  const idBase = `${item.phase}-${item.step.key}`;
  const tokens = useTokens();
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(body));
  const [wrongTries, setWrongTries] = useState(0);
  const [hintsShown, setHintsShown] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [saving, setSaving] = useState(false);
  // Two taps in one frame both see the old render: a ref keeps one save at a time.
  const busy = useRef(false);
  const answer = draftToAnswer(body, draft, currency);

  async function send(result: StepOutcome) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await onDone(result);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  function check() {
    if (!answer) return;
    const grade = gradeStep(body, answer);
    if (checkIn) {
      // The check-in places, it doesn't test: no right or wrong is shown.
      void send({ answer, correct: grade.correct, tries: 1, hintsUsed: 0 });
      return;
    }
    const tries = wrongTries + 1;
    if (grade.correct) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setOutcome({ correct: true, feedback: grade.feedback, final: true, tries });
    } else {
      setWrongTries(tries);
      setOutcome({ correct: false, feedback: grade.feedback, final: tries >= 2, tries });
    }
  }

  function continueOn() {
    if (!outcome || !answer) return;
    void send({ answer, correct: outcome.correct, tries: outcome.tries, hintsUsed: hintsShown });
  }

  const locked = outcome !== null || saving;
  const hints = body.hints;
  // The same step always brings the same coach back, replay or restart.
  const coach = coachFor(item.step.key);

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
      <View className="gap-5 rounded-2xl bg-card p-5">
        <CoachBubble
          coach={coach}
          hints={checkIn ? [] : hints.slice(0, hintsShown)}
          currency={currency}
          checkIn={checkIn}
        >
          {outcome ? (
            <Feedback outcome={outcome} body={body} currency={currency} topicHref={topicHref} />
          ) : null}
        </CoachBubble>

        <View className="gap-2 rounded-2xl border-[6px] border-gold-800 bg-teal-950 p-4">
          <Text className="font-sans-semibold text-caption text-teal-200 uppercase">
            {position}
          </Text>
          <Text accessibilityRole="header" className="font-sans-extrabold text-h1 text-teal-50">
            {renderText(body.prompt, currency)}
          </Text>
          {body.type === "predict" ? (
            <Text className="text-teal-100">{playerCopy.predictNote}</Text>
          ) : null}
        </View>

        <StepInput
          body={body}
          draft={draft}
          onChange={setDraft}
          currency={currency}
          disabled={locked}
          idBase={idBase}
        />

        <ProblemText problem={error} />

        <View className="gap-3">
          {!outcome ? (
            <Button
              size="lg"
              accessibilityLabel={checkIn ? playerCopy.next : playerCopy.check}
              accessibilityState={{ disabled: !answer || saving, busy: saving }}
              disabled={!answer || saving}
              onPress={check}
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text>{checkIn ? playerCopy.next : playerCopy.check}</Text>
              )}
            </Button>
          ) : outcome.final ? (
            <PrimaryButton label={playerCopy.continue} pending={saving} onPress={continueOn} />
          ) : (
            <PrimaryButton
              label={playerCopy.tryAgain}
              pending={false}
              onPress={() => setOutcome(null)}
            />
          )}
          {!checkIn && !outcome?.final && hintsShown < hints.length ? (
            <Button
              variant="outline"
              accessibilityLabel={hintsShown === 0 ? playerCopy.hint : playerCopy.anotherHint}
              onPress={() => setHintsShown((n) => n + 1)}
            >
              <LightbulbIcon size={18} color={tokens.foreground} />
              <Text>{hintsShown === 0 ? playerCopy.hint : playerCopy.anotherHint}</Text>
            </Button>
          ) : null}
          {!checkIn ? stepAside : null}
        </View>
      </View>
    </CurrentStepContext.Provider>
  );
}

/** The coach beside the question: one line, then the hints asked for, then the feedback. */
function CoachBubble({
  coach,
  hints,
  currency,
  checkIn,
  children,
}: {
  coach: Coach;
  hints: string[];
  currency: string;
  checkIn: boolean;
  children?: ReactNode;
}) {
  const line = checkIn ? coach.says.checkIn : hints.length > 0 ? coach.says.hint : coach.says.idle;
  return (
    <View className="gap-1">
      <Text className="font-sans-semibold text-muted-foreground text-small">{coach.name}</Text>
      <View className="gap-2 rounded-2xl rounded-bl-sm bg-secondary p-4">
        {!children || hints.length > 0 ? (
          <Text className="font-sans-semibold text-secondary-foreground">{line}</Text>
        ) : null}
        {!checkIn && hints.length > 0 ? (
          <View accessibilityLabel={playerCopy.hints} className="gap-2">
            {hints.map((hint) => (
              <View key={hint} className="flex-row gap-2 rounded-xl bg-gold-100 p-3">
                <LightbulbIcon size={18} color={palette.gold[700]} />
                <Text className="flex-1 font-sans-semibold text-gold-700">
                  {renderText(hint, currency)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <View accessibilityLiveRegion="polite">{children}</View>
      </View>
    </View>
  );
}

function Feedback({
  outcome,
  body,
  currency,
  topicHref,
}: {
  outcome: Outcome;
  body: StepBody;
  currency: string;
  topicHref?: Href;
}) {
  const router = useRouter();
  const tokens = useTokens();
  const heading = outcome.correct
    ? playerCopy.right
    : outcome.final
      ? playerCopy.final
      : playerCopy.again;
  return (
    <View className={cn("gap-3 rounded-xl p-4", outcome.correct ? "bg-teal-100" : "bg-card")}>
      <View className="flex-row items-center gap-2">
        {outcome.correct ? (
          <CircleCheckIcon size={22} color={tokens.primary} />
        ) : (
          <LightbulbIcon size={22} color={tokens.foreground} />
        )}
        <Text
          accessibilityRole="header"
          className={cn("font-sans-bold text-h3", outcome.correct && "text-teal-800")}
        >
          {heading}
        </Text>
      </View>
      <Text className={cn(outcome.correct && "text-teal-800")}>
        {renderText(outcome.feedback, currency)}
      </Text>
      {outcome.final && !outcome.correct ? (
        <Text className="font-sans-semibold">
          {playerCopy.answerLine(describeAnswer(body, currency))}
        </Text>
      ) : null}
      {outcome.final && body.type === "predict" ? (
        <Text className={cn("font-sans-semibold", outcome.correct && "text-teal-800")}>
          {renderText(body.outcome, currency)}
        </Text>
      ) : null}
      {!outcome.correct && topicHref ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={playerCopy.readAboutTopic}
          onPress={() => router.push(topicHref)}
          className="min-h-11 justify-center"
        >
          <Text className="font-sans-semibold underline">{playerCopy.readAboutTopic}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Done: a calm badge (the web's ring closes; the phone keeps it still). */
function DoneBadge() {
  const tokens = useTokens();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="size-24 items-center justify-center rounded-full border-8 border-gold"
    >
      <CircleCheckIcon size={48} color={tokens.primary} />
    </View>
  );
}
