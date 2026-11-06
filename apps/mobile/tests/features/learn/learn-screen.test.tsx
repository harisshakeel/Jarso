import { questCopy } from "@jarso/core/learning";
import { getFamilyContext } from "@jarso/data/family";
import { getLearningOverview } from "@jarso/data/learning";
import { getJars } from "@jarso/data/ledger";
import { getProgress } from "@jarso/data/progress";
import { getAvailability } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import { LearnScreen } from "@/features/learn";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn().mockRejectedValue(new Error("off")) }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/learning", () => ({ getLearningOverview: jest.fn() }));
jest.mock("@jarso/data/progress", () => ({ getProgress: jest.fn() }));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn() }));
jest.mock("@jarso/data/requests", () => ({ getAvailability: jest.fn() }));
jest.mock("@jarso/data/family", () => ({ getFamilyContext: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));

const router = { push: jest.fn() };
const days = (n: number, done: number) =>
  Array.from({ length: n }, (_, i) => ({
    key: `m${i + 1}`,
    day: i + 1,
    title: `Mission ${i + 1}`,
    summary: "",
    status: i < done ? "done" : i === done ? "current" : "locked",
  }));
const overview = (over: Record<string, unknown> = {}) => ({
  journey: days(7, 2),
  skills: [],
  checkIn: null,
  practiceDue: 0,
  daysThisWeek: 2,
  lastLearnedOn: null,
  nextStep: { kind: "mission", missionKey: "m3", day: 3, title: "Mission 3" },
  completed: [],
  ...over,
});

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LearnScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue(router);
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-03",
  });
  (getJars as jest.Mock).mockResolvedValue({ spend: 1000, save: 2000 });
  (getAvailability as jest.Mock).mockResolvedValue({});
  (getLearningOverview as jest.Mock).mockResolvedValue(overview());
  (getProgress as jest.Mock).mockResolvedValue({
    sparks: 240,
    level: 2,
    streak: 5,
    badges: [],
    look: { lid: "cyan", wear: "none" },
  });
});

describe("LearnScreen", () => {
  it("shows the week banner with 2 / 7", async () => {
    await renderScreen();
    expect(await screen.findByText(questCopy.week(1))).toBeOnTheScreen();
    expect(screen.getByText(questCopy.count(2, 7))).toBeOnTheScreen();
    expect(screen.getAllByText("Mission 3").length).toBeGreaterThan(0);
  });

  it("practice due puts the next-step card above the map", async () => {
    (getLearningOverview as jest.Mock).mockResolvedValue(
      overview({ nextStep: { kind: "practice", due: 2 }, practiceDue: 2 }),
    );
    await renderScreen();
    expect(await screen.findByRole("button", { name: "Practise" })).toBeOnTheScreen();
    expect(screen.getByTestId("quest-stop-now")).toBeOnTheScreen();
  });

  it("fewer than seven missions still shows the chest", async () => {
    (getLearningOverview as jest.Mock).mockResolvedValue(overview({ journey: days(4, 1) }));
    await renderScreen();
    expect(await screen.findByLabelText(questCopy.chestLocked)).toBeOnTheScreen();
    expect(screen.getByText(questCopy.count(1, 4))).toBeOnTheScreen();
  });

  it("streak and Sparks pills come from progress", async () => {
    await renderScreen();
    expect(await screen.findByLabelText(questCopy.streak(5))).toBeOnTheScreen();
    expect(screen.getByLabelText(questCopy.sparks(240))).toBeOnTheScreen();
  });
});
