import { formatDay, needsYouCopy } from "@jarso/core/allowance";
import { dashboardCopy } from "@jarso/core/dashboard";
import { requestSentence } from "@jarso/core/requests";
import { listDueForParent } from "@jarso/data/allowance";
import { getFamilyDashboard } from "@jarso/data/dashboard";
import { findFamilyById, findMembership, listChildMembers } from "@jarso/data/family";
import { listOpenRequests } from "@jarso/data/requests";
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
  it("needs you lists requests and due items, All caught up when empty", async () => {
    setup({ requests: [request], dues: { "child-2": [due] } });
    const { unmount } = await renderHome();
    expect(await screen.findByText(requestSentence(request, "Sam", "£5.00"))).toBeOnTheScreen();
    expect(
      await screen.findByRole("button", {
        name: needsYouCopy.handOverLabel("allowance", "Mia", formatDay("2026-11-03")),
      }),
    ).toBeOnTheScreen();
    expect(screen.getByText(needsYouCopy.title)).toBeOnTheScreen();
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

  it("shows the date line, the title and the children", async () => {
    setup({});
    await renderHome();
    expect(await screen.findByText("Your family")).toBeOnTheScreen();
    expect(await screen.findByText(dashboardCopy.childrenTitle)).toBeOnTheScreen();
    await waitFor(() => expect(screen.getAllByText("£46.50")).toHaveLength(2));
  });
});
