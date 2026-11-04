import type { LearningOverview } from "@jarso/core/learning";
import { getFamilyContext } from "@jarso/data/family";
import { getLearningOverview } from "@jarso/data/learning";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import { LearningSummary } from "@/features/learning";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
jest.mock("@jarso/data/family", () => ({ getFamilyContext: jest.fn() }));
jest.mock("@jarso/data/learning", () => ({ getLearningOverview: jest.fn() }));

const CHILD = "22222222-2222-4222-8222-222222222222";

const overview: LearningOverview = {
  journey: [
    {
      key: "m1",
      day: 1,
      title: "Needs and wants",
      topic: "budgeting",
      summary: "What you need first.",
      status: "done",
      inProgress: false,
      completedOn: "2026-11-02",
    },
    {
      key: "m2",
      day: 2,
      title: "Saving up",
      topic: "saving",
      summary: "Little by little.",
      status: "current",
      inProgress: true,
      completedOn: null,
    },
    {
      key: "m3",
      day: 3,
      title: "Prices",
      topic: "spending",
      summary: "Compare first.",
      status: "locked",
      inProgress: false,
      completedOn: null,
    },
  ],
  skills: [],
  checkIn: { correctCount: 3 },
  practiceDue: 0,
  daysThisWeek: 2,
  lastLearnedOn: "2026-11-02",
  nextStep: { kind: "mission", missionKey: "m2" },
  completed: [
    {
      attemptId: "a1",
      missionKey: "m1",
      title: "Needs and wants",
      completedOn: "2026-11-02",
      firstTry: 4,
      answerable: 5,
      hints: 1,
    },
  ],
} as unknown as LearningOverview;

beforeEach(() => {
  jest.clearAllMocks();
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-03",
  });
  (getLearningOverview as jest.Mock).mockResolvedValue(overview);
});

async function renderSummary() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LearningSummary childId={CHILD} />
    </QueryClientProvider>,
  );
}

describe("LearningSummary", () => {
  it("learning summary shows completed missions and no start button", async () => {
    await renderSummary();

    expect(await screen.findByText("Learned on 2 days this week.")).toBeOnTheScreen();
    expect(screen.getByText("Starting check-in: 3 of 5 known already.")).toBeOnTheScreen();
    expect(screen.getByText("Missions done")).toBeOnTheScreen();
    expect(screen.getByText("2 Nov · 4 of 5 first try. 1 hint.")).toBeOnTheScreen();
    expect(screen.getByText("Started, not finished yet.")).toBeOnTheScreen();
    expect(screen.getByText("Unlocks after the mission before it.")).toBeOnTheScreen();
    // The parent reads; nothing starts or opens a mission.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(getLearningOverview).toHaveBeenCalledWith({ id: "client" }, CHILD, {
      timezone: "Europe/London",
      now: expect.any(Date),
    });
  });

  it("says when nothing is finished yet", async () => {
    (getLearningOverview as jest.Mock).mockResolvedValue({
      ...overview,
      completed: [],
      checkIn: null,
      daysThisWeek: 0,
    });
    await renderSummary();
    expect(await screen.findByText("No missions finished yet.")).toBeOnTheScreen();
    expect(screen.getByText("No learning yet this week.")).toBeOnTheScreen();
    expect(screen.getByText("The starting check-in isn't done yet.")).toBeOnTheScreen();
  });
});
