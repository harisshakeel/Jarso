import { formatDay, needsYouCopy } from "@jarso/core/allowance";
import { familyCardsCopy } from "@jarso/core/dashboard";
import { askCard, askCardCopy } from "@jarso/core/requests";
import { listDueForParent } from "@jarso/data/allowance";
import { getFamilyDashboard } from "@jarso/data/dashboard";
import { findFamilyById, findMembership, listChildMembers } from "@jarso/data/family";
import { getProgress } from "@jarso/data/progress";
import { callDecideWithdrawal, listOpenRequests } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import { FamilyHomeScreen } from "@/features/parent";
import { apiFetch } from "@/lib/api";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/notices", () => ({ dispatchNotices: jest.fn() }));
jest.mock("@/lib/flash", () => ({ flash: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "55555555-5555-4555-8555-555555555555" }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
jest.mock("@jarso/data/family", () => ({
  findMembership: jest.fn(),
  findFamilyById: jest.fn(),
  listChildMembers: jest.fn(),
}));
jest.mock("@jarso/data/requests", () => ({
  listOpenRequests: jest.fn(),
  callDecideWithdrawal: jest.fn(),
  callComplete: jest.fn(),
  callDecideDeposit: jest.fn(),
  callCancel: jest.fn(),
}));
jest.mock("@jarso/data/allowance", () => ({ listDueForParent: jest.fn() }));
jest.mock("@jarso/data/dashboard", () => ({ getFamilyDashboard: jest.fn() }));
jest.mock("@jarso/data/progress", () => ({ getProgress: jest.fn() }));
jest.mock("@jarso/data/learning", () => ({ getLearningOverview: jest.fn() }));

const push = jest.fn();
const family = { id: "family-1", code: "ABC123", currency: "GBP", timezone: "Europe/London" };
const children = [
  { id: "child-1", nickname: "Sam" },
  { id: "child-2", nickname: "Mia" },
];
const request = {
  id: "request-1",
  kind: "withdrawal",
  status: "pending",
  amountMinor: 500,
  reason: "For a book",
  auto: false,
  occurredAt: "2026-11-04T09:00:00Z",
} as const;
const due = { kind: "allowance", id: "occ-1", dueOn: "2026-11-03", amountMinor: 300, note: null };

function dashboardChild(id: string, nickname: string) {
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
  };
}

function setup({
  requests = [],
  dues = {},
}: {
  requests?: unknown[];
  dues?: Record<string, unknown[]>;
}) {
  (useRouter as jest.Mock).mockReturnValue({ push });
  (apiFetch as jest.Mock).mockResolvedValue({ configured: false, enabledChildIds: [] });
  (findMembership as jest.Mock).mockResolvedValue({
    familyId: "family-1",
    role: "parent",
    status: "approved",
  });
  (findFamilyById as jest.Mock).mockResolvedValue(family);
  (listChildMembers as jest.Mock).mockResolvedValue(children);
  (listOpenRequests as jest.Mock).mockImplementation(async (_db, childId: string) =>
    childId === "child-1" ? requests : [],
  );
  (listDueForParent as jest.Mock).mockImplementation(
    async (_db, childId: string) => dues[childId] ?? [],
  );
  (getProgress as jest.Mock).mockResolvedValue({
    sparks: 40,
    level: 2,
    nextLevelAt: 100,
    streak: 3,
    bestStreak: 3,
    restUsedThisWeek: false,
    checkedInToday: false,
    look: { lid: "cyan", wear: "none" },
    badges: [],
    recent: [],
  });
  (getFamilyDashboard as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-04",
    children: [dashboardChild("child-1", "Sam"), dashboardChild("child-2", "Mia")],
  });
}

function renderHome() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <FamilyHomeScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe("FamilyHomeScreen", () => {
  it("needs you lists ask and handover cards, All caught up when empty", async () => {
    setup({ requests: [request], dues: { "child-2": [due] } });
    const { unmount } = await renderHome();
    expect(await screen.findByText(askCard(request, "Sam", "£5.00").title)).toBeOnTheScreen();
    expect(
      await screen.findByRole("button", {
        name: needsYouCopy.handOverLabel("allowance", "Mia", formatDay("2026-11-03")),
      }),
    ).toBeOnTheScreen();
    expect(screen.getByText(familyCardsCopy.needsYou(2))).toBeOnTheScreen();
    expect(screen.queryByText(needsYouCopy.allCaughtUp)).not.toBeOnTheScreen();
    await unmount();

    setup({});
    await renderHome();
    expect(await screen.findByText(needsYouCopy.allCaughtUp)).toBeOnTheScreen();
  });

  it("hand over opens the handover sheet for that item", async () => {
    setup({ dues: { "child-2": [due] } });
    await renderHome();
    const button = await screen.findByRole("button", {
      name: needsYouCopy.handOverLabel("allowance", "Mia", formatDay("2026-11-03")),
    });
    await userEvent.setup().press(button);
    expect(push).toHaveBeenCalledWith("/(parent)/children/child-2/handover/allowance/occ-1");
  });

  it("shows the date line, the title and the child cards", async () => {
    setup({});
    await renderHome();
    expect(await screen.findByText("Your family")).toBeOnTheScreen();
    expect(await screen.findByText(familyCardsCopy.children)).toBeOnTheScreen();
    expect(await screen.findByRole("button", { name: /^Sam\./ })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /^Mia\./ })).toBeOnTheScreen();
    await waitFor(() => expect(screen.getAllByText("£12.50")).toHaveLength(2));
    expect(screen.getAllByText("£34")).toHaveLength(2);
    expect(await screen.findAllByText("Level 2 · 3-day streak")).toHaveLength(2);
  });

  it("answers an ask from Family in one tap", async () => {
    setup({ requests: [request] });
    (callDecideWithdrawal as jest.Mock).mockResolvedValue("approved");
    await renderHome();
    await userEvent.setup().press(await screen.findByRole("button", { name: askCardCopy.yes }));
    await waitFor(() => expect(callDecideWithdrawal).toHaveBeenCalledTimes(1));
    expect(callDecideWithdrawal).toHaveBeenCalledWith(
      { id: "client" },
      { requestId: "request-1", approve: true, note: "" },
    );
  });
});
