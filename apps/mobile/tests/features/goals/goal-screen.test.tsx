import { findLatestSchedule } from "@jarso/data/allowance";
import { getFamilyContext } from "@jarso/data/family";
import { getGoalView } from "@jarso/data/goals";
import { getJars } from "@jarso/data/ledger";
import { getProgress } from "@jarso/data/progress";
import { getAvailability } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import { useCelebrate } from "@/components/celebrate";
import { GoalScreen } from "@/features/goals";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@/components/celebrate", () => ({ useCelebrate: jest.fn() }));
jest.mock("@/features/progress", () => ({ useParentLabel: () => "Mum" }));
jest.mock("@jarso/data/goals", () => ({ getGoalView: jest.fn(), callMarkCelebrated: jest.fn() }));
jest.mock("@jarso/data/allowance", () => ({ findLatestSchedule: jest.fn() }));
jest.mock("@jarso/data/family", () => ({ getFamilyContext: jest.fn() }));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn() }));
jest.mock("@jarso/data/progress", () => ({ getProgress: jest.fn() }));
jest.mock("@jarso/data/requests", () => ({ getAvailability: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));

const push = jest.fn();
const celebrate = jest.fn();
const goal = {
  id: "goal-1",
  name: "Football boots",
  emoji: "⚽",
  targetMinor: 4500,
  planMinor: 500 as number | null,
  reachedAt: null as string | null,
  celebratedAt: null as string | null,
};
const progress = (countedMinor: number) => ({
  countedMinor,
  remainingMinor: Math.max(4500 - countedMinor, 0),
  paymentsLeft: 0,
  reached: countedMinor >= 4500,
  fillRatio: Math.min(countedMinor / 4500, 1),
});

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GoalScreen />
    </QueryClientProvider>,
  ) as ReturnType<typeof render>;
}

const setGoal = (counted: number, over: Partial<typeof goal> = {}) =>
  (getGoalView as jest.Mock).mockResolvedValue({
    goal: { ...goal, ...over },
    progress: progress(counted),
  });

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ push });
  (useCelebrate as jest.Mock).mockReturnValue(celebrate);
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-06",
  });
  (getJars as jest.Mock).mockResolvedValue({ spend: 1000, save: 2000 });
  (getProgress as jest.Mock).mockResolvedValue({});
  (getAvailability as jest.Mock).mockResolvedValue({});
  (findLatestSchedule as jest.Mock).mockResolvedValue({
    amountMinor: 500,
    frequency: "weekly",
    status: "active",
  });
});

describe("GoalScreen", () => {
  it("shows the ring, the item and how much of it is saved", async () => {
    setGoal(2000);
    await renderScreen();
    expect(await screen.findByText("Football boots")).toBeOnTheScreen();
    const ring = screen.getByRole("progressbar");
    expect(ring.props.accessibilityValue.now).toBe(44);
    // The name and amount are read once, by the heading and the line under it.
    expect(ring.props.accessibilityLabel).toBe("Goal progress");
    expect(screen.getByText("⚽")).toBeOnTheScreen();
    expect(screen.getByText("£20 of £45")).toBeOnTheScreen();
  });

  it("lights two stars at 50 percent", async () => {
    setGoal(2300);
    await renderScreen();
    expect(await screen.findByLabelText("2 of 4 stars")).toBeOnTheScreen();
  });

  it("says what is left and about how many weeks", async () => {
    setGoal(2000);
    await renderScreen();
    expect(await screen.findByText("£25 to go · about 5 weeks")).toBeOnTheScreen();
  });

  it("a monthly plan gives its weeks", async () => {
    (findLatestSchedule as jest.Mock).mockResolvedValue({
      amountMinor: 500,
      frequency: "monthly",
      status: "active",
    });
    setGoal(2000);
    await renderScreen();
    // 2500 left at 500 a month = 5 months = ceil(2500 * 52 / (500 * 12)) weeks
    expect(await screen.findByText("£25 to go · about 22 weeks")).toBeOnTheScreen();
  });

  it("without a plan says only what is left", async () => {
    setGoal(2000, { planMinor: null });
    (findLatestSchedule as jest.Mock).mockResolvedValue(null);
    await renderScreen();
    expect(await screen.findByText("£25 to go")).toBeOnTheScreen();
  });

  it("a paused allowance gives no weeks", async () => {
    (findLatestSchedule as jest.Mock).mockResolvedValue({
      amountMinor: 500,
      frequency: "weekly",
      status: "paused",
    });
    setGoal(2000);
    await renderScreen();
    expect(await screen.findByText("£25 to go")).toBeOnTheScreen();
  });

  it("Save some opens put-in", async () => {
    setGoal(2000);
    const user = userEvent.setup();
    await renderScreen();
    await user.press(await screen.findByRole("button", { name: "Save some" }));
    expect(push).toHaveBeenCalledWith("/(child)/put-in");
    expect(screen.getByRole("button", { name: "Change my goal" })).toBeOnTheScreen();
  });

  it("reached goal shows Ask Mum to buy it and celebrates once", async () => {
    setGoal(4500, { reachedAt: "2026-11-05T10:00:00Z" });
    const user = userEvent.setup();
    await renderScreen();
    expect(await screen.findByLabelText("4 of 4 stars")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Save some" })).toBeNull();
    await waitFor(() => expect(celebrate).toHaveBeenCalledTimes(1));
    expect(celebrate.mock.calls[0][0].title).toBe("You did it!");
    await user.press(screen.getByRole("button", { name: "Ask Mum to buy it" }));
    expect(push).toHaveBeenCalledWith("/(child)/take-out");
  });

  it("overshoot shows no negative amount and no to-go line", async () => {
    setGoal(5000, { reachedAt: "2026-11-05T10:00:00Z", celebratedAt: "2026-11-05T11:00:00Z" });
    await renderScreen();
    expect(await screen.findByText("£50 of £45")).toBeOnTheScreen();
    expect(screen.queryByText(/to go/)).toBeNull();
    expect(screen.queryByText(/-/)).toBeNull();
    expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(100);
  });

  it("no goal shows the invitation", async () => {
    (getGoalView as jest.Mock).mockResolvedValue(null);
    await renderScreen();
    expect(
      await screen.findByText("Something to save for? Pick it and see the climb."),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Set a goal" })).toBeOnTheScreen();
  });
});
