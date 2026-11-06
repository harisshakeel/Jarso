import { familyCardsCopy } from "@jarso/core/dashboard";
import { familySettingsCopy } from "@jarso/core/family";
import { getFamilyDashboard } from "@jarso/data/dashboard";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import { ChildrenScreen } from "@/features/parent";
import { apiFetch } from "@/lib/api";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
jest.mock("@jarso/data/dashboard", () => ({ getFamilyDashboard: jest.fn() }));
jest.mock("@jarso/data/progress", () => ({
  getProgress: jest.fn().mockRejectedValue(new Error("off")),
}));
jest.mock("@jarso/data/learning", () => ({
  getLearningOverview: jest.fn().mockRejectedValue(new Error("off")),
}));

const push = jest.fn();

const sam = {
  id: "child-1",
  nickname: "Sam",
  slot: 1,
  spendMinor: 1250,
  saveMinor: 3400,
  reservedMinor: 0,
  goal: null,
  schedule: null,
  due: [],
  gifts: [],
  history: [
    {
      id: "h-1",
      kind: "purchase",
      amountMinor: 300,
      dueMinor: null,
      label: "Bought lunch",
      occurredOn: "2026-11-03",
      undone: false,
      entryId: "e-1",
      canUndo: false,
      paidByCard: false,
      category: "food",
      jar: null,
      canFix: false,
      fixedFrom: null,
    },
  ],
  balances: null,
  flaggedChats: 0,
};

function renderChildren(children: unknown[]) {
  (useRouter as jest.Mock).mockReturnValue({ push });
  (apiFetch as jest.Mock).mockResolvedValue({ configured: false, enabledChildIds: [] });
  (getFamilyDashboard as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-04",
    children,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ChildrenScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe("ChildrenScreen", () => {
  it("child cards show Spend, Save and the goal", async () => {
    await renderChildren([sam]);
    expect(await screen.findByText("£12.50")).toBeOnTheScreen();
    expect(screen.getByText("£34")).toBeOnTheScreen();
    expect(screen.getByText(familyCardsCopy.noGoal)).toBeOnTheScreen();
  });

  it("opens the child hub from a row", async () => {
    await renderChildren([sam]);
    await userEvent.setup().press(await screen.findByRole("button", { name: /^Sam\./ }));
    expect(push).toHaveBeenCalledWith("/(parent)/children/child-1");
  });

  it("adds a child", async () => {
    await renderChildren([sam]);
    await userEvent
      .setup()
      .press(await screen.findByRole("button", { name: familySettingsCopy.addChild }));
    expect(push).toHaveBeenCalledWith("/(parent)/children/new");
  });

  it("shows the first-child card with no children", async () => {
    await renderChildren([]);
    expect(await screen.findByText(familySettingsCopy.firstChild)).toBeOnTheScreen();
  });
});
