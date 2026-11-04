import { type ChildRules, describeRule, rulesCopy } from "@jarso/core/rules";
import { findFamilyById, findMembership, listChildMembers } from "@jarso/data/family";
import {
  findChildRules,
  saveAllowNegativeSpend,
  saveJarMovesApproval,
  saveMoneyRule,
} from "@jarso/data/rules";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { RulesForm } from "@/features/rules";
import { flash } from "@/lib/flash";
import { dispatchNotices } from "@/lib/notices";
import { keys } from "@/lib/query";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/notices", () => ({ dispatchNotices: jest.fn() }));
jest.mock("@/lib/flash", () => ({ flash: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
jest.mock("@jarso/data/family", () => ({
  findMembership: jest.fn(),
  findFamilyById: jest.fn(),
  listChildMembers: jest.fn(),
}));
jest.mock("@jarso/data/rules", () => ({
  findChildRules: jest.fn(),
  saveMoneyRule: jest.fn(),
  saveJarMovesApproval: jest.fn(),
  saveAllowNegativeSpend: jest.fn(),
}));

const CHILD = "22222222-2222-4222-8222-222222222222";
const save = saveMoneyRule as jest.Mock;

const RULES: ChildRules = {
  allowNegativeSpend: false,
  jarMovesApproval: "ask",
  rules: [{ kind: "spend_limit", period: "week", amountMinor: 500 }],
};

beforeEach(() => {
  jest.clearAllMocks();
  (findMembership as jest.Mock).mockResolvedValue({ familyId: "family-1", role: "parent" });
  (findFamilyById as jest.Mock).mockResolvedValue({
    id: "family-1",
    code: "ABC123",
    currency: "GBP",
    timezone: "Europe/London",
  });
  (listChildMembers as jest.Mock).mockResolvedValue([{ id: CHILD, nickname: "Sam" }]);
  (findChildRules as jest.Mock).mockResolvedValue(RULES);
  save.mockResolvedValue(undefined);
  (saveJarMovesApproval as jest.Mock).mockResolvedValue(undefined);
  (saveAllowNegativeSpend as jest.Mock).mockResolvedValue(undefined);
});

async function renderRules() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = jest.spyOn(client, "invalidateQueries");
  const view = await render(
    <QueryClientProvider client={client}>
      <RulesForm childId={CHILD} />
    </QueryClientProvider>,
  );
  return { invalidate, ...view };
}

const weekly = describeRule(RULES.rules[0] as ChildRules["rules"][number], "Sam", "GBP");

describe("RulesForm", () => {
  it("shows each area with what is set now", async () => {
    await renderRules();
    expect(await screen.findByText(weekly)).toBeOnTheScreen();
    expect(screen.getByText(rulesCopy.spendingNotes("Sam"))).toBeOnTheScreen();
    expect(screen.getByText(rulesCopy.capEmpty)).toBeOnTheScreen();
    expect(screen.getByText(rulesCopy.depositEmpty("Sam"))).toBeOnTheScreen();
    expect(findChildRules).toHaveBeenCalledWith({ id: "client" }, CHILD);
  });

  it("turning a limit off sends null", async () => {
    const { invalidate } = await renderRules();
    await userEvent.setup().press(await screen.findByLabelText(rulesCopy.removeLabel(weekly)));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        { id: "client" },
        { childId: CHILD, kind: "spend_limit", period: "week", amountMinor: null },
      ),
    );
    await waitFor(() => expect(flash).toHaveBeenCalledWith(rulesCopy.removed));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.childRules(CHILD) });
    expect(dispatchNotices).toHaveBeenCalled();
  });

  it("adds a limit with the period and amount", async () => {
    await renderRules();
    const user = userEvent.setup();
    await user.press(await screen.findByLabelText(rulesCopy.addSpendLimit));
    await user.press(screen.getByLabelText(rulesCopy.periodLabels.month));
    fireEvent.changeText(screen.getByLabelText(rulesCopy.amount), "12.50");
    await user.press(screen.getByLabelText(rulesCopy.save));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        { id: "client" },
        { childId: CHILD, kind: "spend_limit", period: "month", amountMinor: 1250 },
      ),
    );
    await waitFor(() => expect(flash).toHaveBeenCalledWith(rulesCopy.saved));
  });

  it("amount over the max shows the schema message", async () => {
    await renderRules();
    const user = userEvent.setup();
    await user.press(await screen.findByLabelText(rulesCopy.addSpendLimit));
    fireEvent.changeText(screen.getByLabelText(rulesCopy.amount), "2000000000");
    await user.press(screen.getByLabelText(rulesCopy.save));

    expect(await screen.findByText(/^Enter an amount up to /)).toBeOnTheScreen();
    expect(save).not.toHaveBeenCalled();
  });

  it("jar moves: just tell me saves notify", async () => {
    await renderRules();
    await userEvent.setup().press(await screen.findByLabelText("Just tell me"));
    await waitFor(() =>
      expect(saveJarMovesApproval).toHaveBeenCalledWith({ id: "client" }, CHILD, "notify"),
    );
    await waitFor(() => expect(flash).toHaveBeenCalledWith(rulesCopy.saved));
    expect(dispatchNotices).toHaveBeenCalled();
  });

  it("overspend switch saves and flips back when the save fails", async () => {
    (saveAllowNegativeSpend as jest.Mock).mockRejectedValueOnce(new Error("offline"));
    await renderRules();
    const toggle = await screen.findByLabelText(rulesCopy.overspend("Sam"));
    fireEvent(toggle, "valueChange", true);

    await waitFor(() =>
      expect(saveAllowNegativeSpend).toHaveBeenCalledWith({ id: "client" }, CHILD, true),
    );
    expect(await screen.findByText(rulesCopy.overspendOff("Sam"))).toBeOnTheScreen();
    expect(screen.getByRole("alert")).toBeOnTheScreen();
  });
});
