import { goalCopy, PLAN_MESSAGES } from "@jarso/core/goals";
import { AppError } from "@jarso/core/lib";
import { findLatestSchedule } from "@jarso/data/allowance";
import { getFamilyContext } from "@jarso/data/family";
import { callArchiveGoal, callSaveGoal, getGoalView } from "@jarso/data/goals";
import { getLearningOverview } from "@jarso/data/learning";
import { getJars } from "@jarso/data/ledger";
import { getAvailability, listRequestsFor } from "@jarso/data/requests";
import { findChildRules } from "@jarso/data/rules";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { GoalCard, GoalSheet } from "@/features/goals";
import { keys } from "@/lib/query";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/goals", () => ({
  getGoalView: jest.fn(),
  callSaveGoal: jest.fn(),
  callArchiveGoal: jest.fn(),
  callMarkCelebrated: jest.fn(),
}));
jest.mock("@jarso/data/allowance", () => ({ findLatestSchedule: jest.fn() }));
jest.mock("@jarso/data/learning", () => ({ getLearningOverview: jest.fn() }));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn() }));
jest.mock("@jarso/data/requests", () => ({
  getAvailability: jest.fn(),
  listRequestsFor: jest.fn(),
  callCreateWithdrawal: jest.fn(),
}));
jest.mock("@jarso/data/rules", () => ({ findChildRules: jest.fn() }));
jest.mock("@jarso/data/family", () => ({ getFamilyContext: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
jest.mock("@/components/celebrate", () => ({ useCelebrate: () => jest.fn() }));
jest.mock("@/features/progress", () => ({ useParentLabel: () => "Mum" }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "11111111-1111-4111-8111-111111111111" }));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: "success" },
}));

const push = jest.fn();
const goal = {
  id: "goal-1",
  name: "Football boots",
  emoji: "⚽",
  targetMinor: 4500,
  planMinor: 500,
  reachedAt: null,
  celebratedAt: null,
};
const progress = (countedMinor: number) => ({
  countedMinor,
  remainingMinor: Math.max(4500 - countedMinor, 0),
  paymentsLeft: Math.ceil(Math.max(4500 - countedMinor, 0) / 500),
  reached: countedMinor >= 4500,
  fillRatio: Math.min(countedMinor / 4500, 1),
});

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  return { client, ui: <QueryClientProvider client={client}>{ui}</QueryClientProvider> };
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ push, back: jest.fn(), canGoBack: () => true });
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-03",
  });
  (getJars as jest.Mock).mockResolvedValue({ spend: 1000, save: 2000 });
  (getAvailability as jest.Mock).mockResolvedValue({
    spendMinor: 1000,
    saveMinor: 2000,
    reservedSaveMinor: 0,
    heldSpendMinor: 0,
    availableSaveMinor: 2000,
    availableSpendMinor: 1000,
    takeOutLimitMinor: null,
  });
  (findLatestSchedule as jest.Mock).mockResolvedValue({
    amountMinor: 500,
    frequency: "weekly",
    status: "active",
  });
  (listRequestsFor as jest.Mock).mockResolvedValue([]);
  (findChildRules as jest.Mock).mockResolvedValue({ jarMovesApproval: "ask", rules: [] });
  (getLearningOverview as jest.Mock).mockResolvedValue({ nextStep: { kind: "done" } });
});

describe("goals", () => {
  it("no goal shows invitation and opens sheet", async () => {
    (getGoalView as jest.Mock).mockResolvedValue(null);
    const user = userEvent.setup();
    await render(wrap(<GoalCard currency="GBP" />).ui);
    expect(await screen.findByText(goalCopy.card.empty)).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: goalCopy.sheet.triggerNew }));
    expect(push).toHaveBeenCalledWith("/(child)/goal-sheet");
  });

  it("shows the goal with a gold bar and what is left", async () => {
    (getGoalView as jest.Mock).mockResolvedValue({ goal, progress: progress(2000) });
    await render(wrap(<GoalCard currency="GBP" />).ui);
    expect(await screen.findByText("⚽ Football boots")).toBeOnTheScreen();
    expect(screen.getByText("£20 of £45")).toBeOnTheScreen();
    const bar = screen.getByRole("progressbar");
    expect(bar.props.accessibilityValue.now).toBe(44);
    expect(bar.props.accessibilityLabel).toBe("⚽ Football boots, £45.");
    expect(screen.getByText("£25 to go · about 5 weeks")).toBeOnTheScreen();
    const link = screen.getByRole("link", {
      name: "Football boots. £25 to go · about 5 weeks",
    });
    expect(link.props.accessibilityHint).toBe(goalCopy.card.seeIt);
  });

  it("no plan says what is left", async () => {
    (getGoalView as jest.Mock).mockResolvedValue({
      goal: { ...goal, planMinor: null },
      progress: { ...progress(2000), paymentsLeft: null },
    });
    await render(wrap(<GoalCard currency="GBP" />).ui);
    expect(await screen.findByText("£25 to go")).toBeOnTheScreen();
  });

  it("card has a decorative ring and still one progressbar", async () => {
    (getGoalView as jest.Mock).mockResolvedValue({ goal, progress: progress(2000) });
    await render(wrap(<GoalCard currency="GBP" />).ui);
    await screen.findByText("⚽ Football boots");
    const ring = screen.getByTestId("goal-ring", { includeHiddenElements: true });
    expect(ring.props.accessibilityElementsHidden).toBe(true);
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });

  it("reached fills the bar", async () => {
    (getGoalView as jest.Mock).mockResolvedValue({ goal, progress: progress(5000) });
    await render(wrap(<GoalCard currency="GBP" />).ui);
    expect(await screen.findByText("You did it!")).toBeOnTheScreen();
    expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(100);
  });

  it("save goal over allowance shows PLAN_MESSAGES error", async () => {
    (getGoalView as jest.Mock).mockResolvedValue(null);
    const plan = PLAN_MESSAGES.plan_over_allowance as string;
    (callSaveGoal as jest.Mock).mockRejectedValue(
      new AppError("VALIDATION", plan, { fieldErrors: { plan: [plan] } }),
    );
    const user = userEvent.setup();
    const onClose = jest.fn();
    await render(wrap(<GoalSheet onClose={onClose} />).ui);
    await user.type(await screen.findByLabelText(goalCopy.sheet.nameLabel), "Boots");
    await user.press(screen.getByRole("radio", { name: "⚽" }));
    await user.type(screen.getByLabelText(goalCopy.sheet.targetLabel), "45");
    await user.type(screen.getByLabelText(goalCopy.sheet.planLabel), "9");
    expect(screen.getByText(goalCopy.sheet.planHint("£5"))).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: goalCopy.sheet.submit }));
    expect(await screen.findByText(plan)).toBeOnTheScreen();
    expect(callSaveGoal).toHaveBeenCalledWith(
      { id: "client" },
      { name: "Boots", emoji: "⚽", targetMinor: 4500, planMinor: 900 },
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("saves a goal, refreshes goal and Home, and closes", async () => {
    (getGoalView as jest.Mock).mockResolvedValue(null);
    (callSaveGoal as jest.Mock).mockResolvedValue("goal-2");
    const user = userEvent.setup();
    const onClose = jest.fn();
    const { client, ui } = wrap(<GoalSheet onClose={onClose} />);
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await render(ui);
    await user.type(await screen.findByLabelText(goalCopy.sheet.nameLabel), "Boots");
    await user.press(screen.getByRole("radio", { name: "⚽" }));
    await user.type(screen.getByLabelText(goalCopy.sheet.targetLabel), "45");
    expect(
      screen.getByText("Set how much you'll save each time to see how long it'll take"),
    ).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: goalCopy.sheet.submit }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.goal("child-1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.home("child-1") });
  });

  it("start a new goal asks to confirm", async () => {
    (getGoalView as jest.Mock).mockResolvedValue({ goal, progress: progress(2000) });
    (callArchiveGoal as jest.Mock).mockResolvedValue(undefined);
    const user = userEvent.setup();
    const onClose = jest.fn();
    await render(wrap(<GoalSheet onClose={onClose} />).ui);
    await user.press(await screen.findByRole("button", { name: goalCopy.newGoal.trigger }));
    expect(screen.getByText(goalCopy.newGoal.title)).toBeOnTheScreen();
    expect(screen.getByText(goalCopy.newGoal.description)).toBeOnTheScreen();
    expect(callArchiveGoal).not.toHaveBeenCalled();
    await user.press(screen.getByRole("button", { name: goalCopy.newGoal.cancel }));
    expect(screen.queryByText(goalCopy.newGoal.description)).toBeNull();
    await user.press(screen.getByRole("button", { name: goalCopy.newGoal.trigger }));
    await user.press(screen.getByRole("button", { name: goalCopy.newGoal.confirm }));
    await waitFor(() => expect(callArchiveGoal).toHaveBeenCalledWith({ id: "client" }, "goal-1"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
