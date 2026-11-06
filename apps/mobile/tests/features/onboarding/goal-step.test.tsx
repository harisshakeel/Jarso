import { PLAN_MESSAGES } from "@jarso/core/goals";
import { AppError } from "@jarso/core/lib";
import { onboardingCopy } from "@jarso/core/onboarding";
import { findLatestSchedule } from "@jarso/data/allowance";
import { getFamilyContext } from "@jarso/data/family";
import { callSaveGoal, getGoalView } from "@jarso/data/goals";
import { getJars } from "@jarso/data/ledger";
import { getAvailability } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { GoalStep } from "@/features/onboarding/goal-step";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
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
jest.mock("@jarso/data/family", () => ({ getFamilyContext: jest.fn() }));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn() }));
jest.mock("@jarso/data/requests", () => ({ getAvailability: jest.fn() }));

const c = onboardingCopy.goal;

async function renderStep(onNext = jest.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await render(
    <QueryClientProvider client={client}>
      <GoalStep onNext={onNext} onSkip={jest.fn()} />
    </QueryClientProvider>,
  );
  return onNext;
}

async function typePrice(digits: string) {
  for (const d of digits) await fireEvent.press(screen.getByRole("button", { name: d }));
}

beforeEach(() => {
  jest.clearAllMocks();
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "INR",
    timezone: "Asia/Kolkata",
    today: "2026-11-06",
  });
  (getJars as jest.Mock).mockResolvedValue({ spend: 1000, save: 0 });
  (getAvailability as jest.Mock).mockResolvedValue({ saveMinor: 0, reservedSaveMinor: 0 });
  (getGoalView as jest.Mock).mockResolvedValue(null);
  (findLatestSchedule as jest.Mock).mockResolvedValue({
    amountMinor: 12000,
    frequency: "weekly",
    status: "active",
  });
  (callSaveGoal as jest.Mock).mockResolvedValue("goal-1");
});

describe("GoalStep", () => {
  it("an existing goal is shown and kept, never saved", async () => {
    (getGoalView as jest.Mock).mockResolvedValue({
      goal: {
        id: "g1",
        name: "Bike",
        emoji: "🚲",
        targetMinor: 50000,
        planMinor: 5000,
        reachedAt: null,
        celebratedAt: null,
      },
      progress: {
        countedMinor: 0,
        remainingMinor: 50000,
        paymentsLeft: 10,
        reached: false,
        fillRatio: 0,
      },
    });
    const onNext = await renderStep();
    expect(await screen.findByText("🚲 Bike")).toBeTruthy();
    expect(await screen.findByText("₹500 to go · about 10 weeks")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: c.keep }));
    expect(onNext).toHaveBeenCalled();
    expect(callSaveGoal).not.toHaveBeenCalled();
  });

  it("picking Boots then 450 shows about 15 weeks with 30 a week", async () => {
    await renderStep();
    await fireEvent.press(await screen.findByRole("radio", { name: "Boots" }));
    expect(screen.getByText(c.costLabel)).toBeTruthy();
    await typePrice("450");
    expect(await screen.findByText("With ₹30 a week")).toBeTruthy();
    expect(screen.getByText("About 15 weeks")).toBeTruthy();
  });

  it("Set my goal saves the real goal", async () => {
    const onNext = await renderStep();
    await fireEvent.press(await screen.findByRole("radio", { name: "Boots" }));
    await typePrice("450");
    // The plan comes from the allowance read.
    expect(await screen.findByText("With ₹30 a week")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: c.submit }));
    await waitFor(() => expect(onNext).toHaveBeenCalled());
    expect(callSaveGoal).toHaveBeenCalledWith(
      {},
      { name: "Boots", emoji: "⚽", targetMinor: 45000, planMinor: 3000 },
    );
  });

  it("without an allowance there is no weeks line and the plan is empty", async () => {
    (findLatestSchedule as jest.Mock).mockResolvedValue(null);
    const onNext = await renderStep();
    await fireEvent.press(await screen.findByRole("radio", { name: "Game" }));
    await typePrice("450");
    expect(screen.queryByText(/About \d+ weeks?/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: c.submit }));
    await waitFor(() => expect(onNext).toHaveBeenCalled());
    expect(callSaveGoal).toHaveBeenCalledWith(
      {},
      { name: "Game", emoji: "🎮", targetMinor: 45000, planMinor: null },
    );
  });

  it("a refused plan shows its line and Not now still moves on", async () => {
    const plan = PLAN_MESSAGES.plan_over_allowance as string;
    (callSaveGoal as jest.Mock).mockRejectedValue(
      new AppError("VALIDATION", plan, { fieldErrors: { plan: [plan] } }),
    );
    const onNext = await renderStep();
    await fireEvent.press(await screen.findByRole("radio", { name: "Boots" }));
    await typePrice("450");
    await fireEvent.press(screen.getByRole("button", { name: c.submit }));
    expect(await screen.findByText(plan)).toBeTruthy();
    expect(onNext).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: c.notNow }));
    expect(onNext).toHaveBeenCalled();
  });

  it("Set my goal waits for a price", async () => {
    await renderStep();
    await fireEvent.press(await screen.findByRole("radio", { name: "Boots" }));
    await fireEvent.press(screen.getByRole("button", { name: c.submit }));
    expect(callSaveGoal).not.toHaveBeenCalled();
  });
});
