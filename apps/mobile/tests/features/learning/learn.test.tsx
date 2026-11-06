import type { AnswerableStep, Step } from "@jarso/core/learning";
import { learnCopy, playerCopy, questCopy, renderText } from "@jarso/core/learning";
import { findMission, findTopic } from "@jarso/core/learning/content";
import type { OutboxItem } from "@jarso/core/offline";
import { getFamilyContext } from "@jarso/data/family";
import { getLearningOverview, getMissionSession, getPracticeSet } from "@jarso/data/learning";
import { getJars } from "@jarso/data/ledger";
import { getAvailability } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { CheckInScreen, MissionScreen, PracticeScreen, TopicScreen } from "@/features/learn";
import { NextStepCard, withQueuedSteps } from "@/features/learning";
import { outboxPlatform, submit } from "@/lib/outbox";

jest.mock("@/lib/sound", () => ({ playSound: jest.fn() }));
jest.mock("@jarso/data/progress", () => ({
  getProgress: jest.fn().mockRejectedValue(new Error("off")),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn().mockRejectedValue(new Error("off")) }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/learning", () => ({
  getLearningOverview: jest.fn(),
  getMissionSession: jest.fn(),
  getPracticeSet: jest.fn(),
  getWeeklyReview: jest.fn(),
}));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn() }));
jest.mock("@jarso/data/requests", () => ({ getAvailability: jest.fn() }));
jest.mock("@jarso/data/family", () => ({ getFamilyContext: jest.fn() }));
jest.mock("@/lib/outbox", () => ({
  submit: jest.fn(),
  useOutboxItems: () => [],
  useOnline: () => true,
  outboxPlatform: { openStore: jest.fn() },
}));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "33333333-3333-4333-8333-333333333333" }));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: "success" },
}));

const ATTEMPT = "22222222-2222-4222-8222-222222222222";
const LEARN = "/(child)/(tabs)/learn";
const router = { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn(), replace: jest.fn() };
const mission = findMission("whats-in-spend");
if (!mission) throw new Error("mission 1 is missing");
const step = (key: string) => mission.steps.find((s) => s.key === key) as AnswerableStep;
const optionText = (s: Step, id: string) => {
  if (s.type !== "choice" && s.type !== "predict" && s.type !== "reason") throw new Error(s.type);
  const option = s.options.find((o) => o.id === id);
  return renderText(option?.text ?? "", "GBP");
};
let queued: OutboxItem[] = [];

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

const overview = (over: Record<string, unknown> = {}) => ({
  journey: [],
  skills: [],
  checkIn: null,
  practiceDue: 0,
  daysThisWeek: 0,
  lastLearnedOn: null,
  nextStep: { kind: "done" },
  completed: [],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  queued = [];
  (useRouter as jest.Mock).mockReturnValue(router);
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-03",
  });
  (getJars as jest.Mock).mockResolvedValue({ spend: 1000, save: 2000 });
  (getAvailability as jest.Mock).mockResolvedValue({});
  (getLearningOverview as jest.Mock).mockResolvedValue(overview());
  (outboxPlatform.openStore as jest.Mock).mockResolvedValue({
    listForUser: async () => queued,
  });
  (submit as jest.Mock).mockResolvedValue({ status: "queued" });
});

const result = (stepKey: string) => ({
  stepKey,
  phase: "main" as const,
  correct: true,
  hintsUsed: 0,
  tries: 1,
});

const queuedStep = (payload: Record<string, unknown>, status: OutboxItem["status"] = "waiting") =>
  ({
    id: `item-${String(payload.stepKey)}`,
    userId: "child-1",
    kind: "step",
    payload,
    idempotencyKey: `key-${String(payload.stepKey)}`,
    createdAt: "2026-11-03T10:00:00Z",
    attempts: 0,
    nextAttemptAt: "2026-11-03T10:00:00Z",
    status,
  }) satisfies OutboxItem;

describe("learn", () => {
  it("locked mission routes back to Learn", async () => {
    (getMissionSession as jest.Mock).mockResolvedValue(null);
    await render(wrap(<MissionScreen missionKey="whats-in-spend" />));
    await waitFor(() => expect(router.dismissTo).toHaveBeenCalledWith(LEARN));
    expect(screen.queryByText(playerCopy.startMission)).toBeNull();
  });

  it("answer graded on device shows right/wrong and queues a step", async () => {
    (getMissionSession as jest.Mock).mockResolvedValue({ attemptId: ATTEMPT, results: [] });
    const user = userEvent.setup();
    await render(wrap(<MissionScreen missionKey="whats-in-spend" />));
    await user.press(await screen.findByRole("button", { name: playerCopy.continue }));
    // The info step, then the first question.
    await user.press(await screen.findByRole("button", { name: playerCopy.continue }));
    const choice = step("which-can-you-buy");
    expect(await screen.findByText(renderText(choice.prompt, "GBP"))).toBeOnTheScreen();

    await user.press(screen.getByRole("radio", { name: optionText(choice, "game") }));
    await user.press(screen.getByRole("button", { name: playerCopy.check }));
    expect(await screen.findByText(questCopy.sheet.wrong)).toBeOnTheScreen();
    // Wrong but not final: a hint can still be asked for.
    expect(screen.getByRole("button", { name: playerCopy.hint })).toBeOnTheScreen();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();

    await user.press(screen.getByRole("button", { name: playerCopy.tryAgain }));
    await user.press(screen.getByRole("radio", { name: optionText(choice, "comic") }));
    await user.press(screen.getByRole("button", { name: playerCopy.check }));
    expect(await screen.findByText(questCopy.sheet.right)).toBeOnTheScreen();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");

    await user.press(screen.getByRole("button", { name: playerCopy.continue }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        userId: "child-1",
        kind: "step",
        payload: {
          attemptId: ATTEMPT,
          stepKey: "which-can-you-buy",
          phase: "main",
          answer: { kind: "option", optionId: "comic" },
          hintsUsed: 0,
          tries: 2,
        },
        idempotencyKey: "33333333-3333-4333-8333-333333333333",
      }),
    );
    // Queued (offline) still moves on: the step was graded on the phone.
    expect(await screen.findByText(playerCopy.stepPosition(3, 7))).toBeOnTheScreen();
  });

  it("finish only after every step", async () => {
    const answered = mission.steps
      .filter((s) => s.type !== "info" && s.key !== "why-check-first")
      .map((s) => result(s.key));
    (getMissionSession as jest.Mock).mockResolvedValue({ attemptId: ATTEMPT, results: answered });
    (submit as jest.Mock).mockImplementation(async ({ kind }: { kind: string }) =>
      kind === "completeMission"
        ? { status: "sent", data: { answerable: 6, firstTry: 6, hints: 0 } }
        : { status: "sent", data: null },
    );
    const user = userEvent.setup();
    await render(wrap(<MissionScreen missionKey="whats-in-spend" />));
    await user.press(await screen.findByRole("button", { name: playerCopy.continue }));
    const last = step("why-check-first");
    expect(await screen.findByText(playerCopy.stepPosition(7, 7))).toBeOnTheScreen();
    expect(submit).not.toHaveBeenCalled();

    if (last.type !== "reason") throw new Error(last.type);
    await user.press(screen.getByRole("radio", { name: optionText(last, last.answer) }));
    await user.press(screen.getByRole("button", { name: playerCopy.check }));
    await user.press(await screen.findByRole("button", { name: playerCopy.continue }));

    expect(await screen.findByText(playerCopy.missionDone)).toBeOnTheScreen();
    expect(screen.getByText("Every one first time. Great thinking.")).toBeOnTheScreen();
    const kinds = (submit as jest.Mock).mock.calls.map(([input]) => input.kind);
    expect(kinds).toEqual(["step", "completeMission"]);
    expect((submit as jest.Mock).mock.calls[1]?.[0].payload).toEqual({ attemptId: ATTEMPT });
  });

  it("resume after restart skips recorded and queued steps", async () => {
    (getMissionSession as jest.Mock).mockResolvedValue({
      attemptId: ATTEMPT,
      results: [result("which-can-you-buy")],
    });
    queued = [
      queuedStep({
        attemptId: ATTEMPT,
        stepKey: "whats-left",
        phase: "main",
        answer: { kind: "number", value: 600 },
        hintsUsed: 0,
        tries: 1,
      }),
    ];
    const user = userEvent.setup();
    await render(wrap(<MissionScreen missionKey="whats-in-spend" />));
    expect(await screen.findByText(playerCopy.resumedHeading)).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: playerCopy.continue }));
    expect(await screen.findByText(playerCopy.stepPosition(4, 7))).toBeOnTheScreen();
    expect(screen.getByText(renderText(step("snack-then-ticket").prompt, "GBP"))).toBeOnTheScreen();
    expect(screen.queryByText(renderText(step("whats-left").prompt, "GBP"))).toBeNull();
  });

  it("merges only this attempt's queued steps the server didn't refuse", () => {
    const base = {
      phase: "main",
      answer: { kind: "number", value: 600 },
      hintsUsed: 1,
      tries: 2,
    };
    const merged = withQueuedSteps(
      [result("which-can-you-buy")],
      [
        queuedStep({ ...base, attemptId: ATTEMPT, stepKey: "whats-left" }),
        queuedStep({ ...base, attemptId: ATTEMPT, stepKey: "which-can-you-buy" }),
        queuedStep({ ...base, attemptId: "other", stepKey: "how-many-packs" }),
        queuedStep({ ...base, attemptId: ATTEMPT, stepKey: "afford-or-not-yet" }, "needs_look"),
      ],
      ATTEMPT,
      mission.steps,
    );
    expect(merged).toEqual([
      result("which-can-you-buy"),
      { stepKey: "whats-left", phase: "main", correct: true, hintsUsed: 1, tries: 2 },
    ]);
  });

  it("practice all caught up", async () => {
    (getPracticeSet as jest.Mock).mockResolvedValue([]);
    const user = userEvent.setup();
    await render(wrap(<PracticeScreen />));
    expect(await screen.findByText(learnCopy.practice.caughtUpHeading)).toBeOnTheScreen();
    expect(screen.getByText(learnCopy.practice.caughtUpBody)).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: learnCopy.backToLearn }));
    expect(router.dismissTo).toHaveBeenCalledWith(LEARN);
  });

  it("check-in done shows done state", async () => {
    (getLearningOverview as jest.Mock).mockResolvedValue(
      overview({ checkIn: { completedAt: "2026-11-01T10:00:00Z", correctCount: 3 } }),
    );
    await render(wrap(<CheckInScreen />));
    expect(await screen.findByText(learnCopy.checkIn.doneHeading)).toBeOnTheScreen();
    expect(screen.queryByText(playerCopy.startQuestions)).toBeNull();
  });

  it("topic mode saves nothing", async () => {
    const topic = findTopic("tradeoffs");
    if (topic?.practice.type !== "choice") throw new Error("topic content changed");
    const user = userEvent.setup();
    await render(wrap(<TopicScreen topicKey="tradeoffs" />));
    expect(await screen.findByText(topic.title)).toBeOnTheScreen();
    await user.press(
      screen.getByRole("radio", { name: optionText(topic.practice, topic.practice.answer) }),
    );
    await user.press(screen.getByRole("button", { name: playerCopy.check }));
    await user.press(await screen.findByRole("button", { name: playerCopy.continue }));
    expect(await screen.findByText(playerCopy.topicDone.heading)).toBeOnTheScreen();
    expect(submit).not.toHaveBeenCalled();
  });

  it("the next step card opens its own screen", async () => {
    const user = userEvent.setup();
    await render(wrap(<NextStepCard step={{ kind: "practice", count: 2 }} />));
    await user.press(screen.getByRole("button", { name: "Practise" }));
    expect(router.push).toHaveBeenCalledWith("/(child)/learn/practice");
  });
});
