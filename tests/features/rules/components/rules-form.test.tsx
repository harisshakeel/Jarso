import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RulesForm } from "@/features/rules/components/rules-form";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/features/rules/server/actions", () => ({
  setRuleAction: vi.fn(),
  setOverspendAction: vi.fn(),
}));

afterEach(cleanup);

const show = (rules: React.ComponentProps<typeof RulesForm>["rules"]) =>
  render(<RulesForm childId="c1" nickname="Sam" currency="GBP" rules={rules} />);

describe("RulesForm", () => {
  it("has a section each for spending, taking out and putting in, with no switches", () => {
    show({ allowNegativeSpend: false, rules: [] });
    for (const name of ["Spending", "Taking money out of Save", "Putting money into Save"]) {
      expect(screen.getByRole("group", { name })).toBeInTheDocument();
    }
    // The only switch left is the overspend one; rules are sentences and buttons.
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add a spending limit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a limit" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Let Sam take out without asking" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Let put-ins count before I confirm" }),
    ).toBeInTheDocument();
  });

  it("reads empty groups as plain sentences", () => {
    show({ allowNegativeSpend: false, rules: [] });
    expect(screen.getByText("No spending limits yet")).toBeInTheDocument();
    expect(screen.getByText("No limit: any amount can be asked for.")).toBeInTheDocument();
    expect(screen.getByText("Nothing yet: every take-out waits for your yes.")).toBeInTheDocument();
  });

  it("lists each saved rule as its sentence with Change and Remove", () => {
    show({
      allowNegativeSpend: false,
      rules: [
        { kind: "withdrawal_auto_approve", period: "item", amountMinor: 500 },
        { kind: "deposit_auto_confirm", period: "week", amountMinor: 1000 },
        { kind: "withdrawal_cap", period: "month", amountMinor: 3000 },
      ],
    });
    const takeOut = within(screen.getByRole("group", { name: "Taking money out of Save" }));
    expect(
      takeOut.getByText("Sam can take out up to £5 each time without asking me"),
    ).toBeInTheDocument();
    expect(takeOut.getByText("Sam can take out at most £30 a month")).toBeInTheDocument();
    expect(takeOut.getAllByRole("button", { name: /^Change: / })).toHaveLength(2);
    expect(takeOut.getAllByRole("button", { name: /^Remove: / })).toHaveLength(2);
    expect(screen.getByText("Withdrawals over £5 come to you for approval")).toBeInTheDocument();
    expect(
      screen.getByText("Deposits beyond £10 a week wait for you to confirm"),
    ).toBeInTheDocument();
  });
});
