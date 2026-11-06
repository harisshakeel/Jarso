import type { DashboardChild } from "@jarso/core/dashboard";
import { familyCardsCopy } from "@jarso/core/dashboard";
import { getLearningOverview } from "@jarso/data/learning";
import { getProgress } from "@jarso/data/progress";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import { ChildCards } from "@/features/parent";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
jest.mock("@jarso/data/progress", () => ({ getProgress: jest.fn() }));
jest.mock("@jarso/data/learning", () => ({ getLearningOverview: jest.fn() }));

const push = jest.fn();

function child(id: string, nickname: string, extra: Partial<DashboardChild> = {}): DashboardChild {
  return {
    id,
    nickname,
    slot: 1,
    spendMinor: 1250,
    saveMinor: 3400,
    reservedMinor: 0,
    goal: null,
    schedule: null,
    due: [],
    gifts: [],
    history: [],
    balances: null,
    flaggedChats: 0,
    ...extra,
  };
}

const boots = {
  goal: { id: "g", emoji: "⚽", name: "Boots", targetMinor: 4000, planMinor: null },
  progress: {
    countedMinor: 3000,
    remainingMinor: 1000,
    paymentsLeft: null,
    reached: false,
    fillRatio: 0.75,
  },
} as unknown as DashboardChild["goal"];

function progress(level: number, streak: number) {
  return {
    sparks: 999,
    level,
    nextLevelAt: null,
    streak,
    bestStreak: streak,
    restUsedThisWeek: false,
    checkedInToday: false,
    look: { lid: "grape", wear: "cap" },
    badges: [],
    recent: [],
  };
}

const statuses = ["done", "done", "done", "current", "locked", "locked", "locked"] as const;
const overview = {
  journey: statuses.map((status, i) => ({
    key: `m${i}`,
    day: i + 1,
    title: `Mission ${i + 1}`,
    status,
  })),
};

async function renderCards(items: DashboardChild[]) {
  (useRouter as jest.Mock).mockReturnValue({ push });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  await render(
    <QueryClientProvider client={client}>
      <ChildCards items={items} currency="GBP" timezone="Europe/London" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (getLearningOverview as jest.Mock).mockResolvedValue(overview);
  (getProgress as jest.Mock).mockImplementation(async (_db, id: string) =>
    id === "child-1" ? progress(4, 5) : progress(2, 0),
  );
});

describe("ChildCards", () => {
  it("shows Jarso, the line and three money tiles", async () => {
    await renderCards([child("child-1", "Sam", { goal: boots })]);
    expect(await screen.findByText("Level 4 · 5-day streak · Missions 3/7")).toBeOnTheScreen();
    expect(screen.getByText("£12.50")).toBeOnTheScreen();
    expect(screen.getByText("£34")).toBeOnTheScreen();
    expect(screen.getByText("75%")).toBeOnTheScreen();
    expect(screen.getByText(familyCardsCopy.spend)).toBeOnTheScreen();
    expect(screen.getByText(familyCardsCopy.save)).toBeOnTheScreen();
    expect(screen.queryByText(/999|spark/i)).toBeNull();
  });

  it("opens the child's hub", async () => {
    await renderCards([child("child-1", "Sam")]);
    await userEvent.setup().press(await screen.findByRole("button", { name: /^Sam\./ }));
    expect(push).toHaveBeenCalledWith("/(parent)/children/child-1");
  });

  it("progress that fails leaves level and streak out", async () => {
    (getProgress as jest.Mock).mockRejectedValue(new Error("offline"));
    await renderCards([child("child-1", "Sam")]);
    expect(await screen.findByText("Missions 3/7")).toBeOnTheScreen();
    expect(screen.getByText("£12.50")).toBeOnTheScreen();
    expect(screen.queryByText(/Level/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("two children each show only their own", async () => {
    await renderCards([child("child-1", "Sam"), child("child-2", "Mia", { saveMinor: 100 })]);
    expect(await screen.findByText("Level 4 · 5-day streak · Missions 3/7")).toBeOnTheScreen();
    expect(await screen.findByText("Level 2 · Missions 3/7")).toBeOnTheScreen();
    const names = screen.getAllByRole("button").map((b) => b.props.accessibilityLabel as string);
    expect(names[0]).toMatch(/^Sam\./);
    expect(names[1]).toMatch(/^Mia\./);
    for (const name of names) expect(name.includes("Sam") && name.includes("Mia")).toBe(false);
  });

  it("no goal says No goal", async () => {
    await renderCards([child("child-1", "Sam")]);
    expect(await screen.findByText(familyCardsCopy.noGoal)).toBeOnTheScreen();
  });

  it("asks the progress of each child by id", async () => {
    await renderCards([child("child-1", "Sam"), child("child-2", "Mia")]);
    await waitFor(() => expect(getProgress).toHaveBeenCalledTimes(2));
    expect(getProgress).toHaveBeenCalledWith({ id: "client" }, "child-1");
    expect(getProgress).toHaveBeenCalledWith({ id: "client" }, "child-2");
  });
});
