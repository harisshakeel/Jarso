import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RulesForm } from "./rules-form";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("../server/actions", () => ({ setRuleAction: vi.fn(), setOverspendAction: vi.fn() }));

afterEach(cleanup);

const show = (rules: React.ComponentProps<typeof RulesForm>["rules"]) =>
  render(<RulesForm childId="c1" nickname="Sam" currency="GBP" rules={rules} />);

describe("RulesForm", () => {
  it("has a section each for spending, taking out and putting in", () => {
    show({ allowNegativeSpend: false, rules: [] });
    for (const name of ["Spending", "Taking money out of Save", "Putting money into Save"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("Deposits will count before you get the cash")).toBeInTheDocument();
  });

  it("names each section as a group and describes each switch by its sentence", () => {
    show({
      allowNegativeSpend: false,
      rules: [{ kind: "withdrawal_auto_approve", period: "item", amountMinor: 500 }],
    });
    for (const name of ["Spending", "Taking money out of Save", "Putting money into Save"]) {
      expect(screen.getByRole("group", { name })).toBeInTheDocument();
    }
    const takeOut = within(screen.getByRole("group", { name: "Taking money out of Save" }));
    const [, autoApprove] = takeOut.getAllByRole("switch", { name: "Per time" });
    expect(autoApprove).toHaveAccessibleDescription(
      "Sam can take out up to £5 per time without asking me",
    );
    const amount = takeOut.getByLabelText("Per time limit");
    expect(amount).toHaveAccessibleDescription(
      "Sam can take out up to £5 per time without asking me",
    );
  });

  it("sums up what comes to the parent", () => {
    show({
      allowNegativeSpend: false,
      rules: [
        { kind: "withdrawal_auto_approve", period: "item", amountMinor: 500 },
        { kind: "deposit_auto_confirm", period: "week", amountMinor: 1000 },
      ],
    });
    expect(screen.getByText("Withdrawals over £5 come to you for approval")).toBeInTheDocument();
    expect(
      screen.getByText("Deposits beyond £10 a week wait for you to confirm"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sam can take out up to £5 per time without asking me"),
    ).toBeInTheDocument();
  });

  it("shows the cap rule row", () => {
    show({
      allowNegativeSpend: false,
      rules: [{ kind: "withdrawal_cap", period: "month", amountMinor: 3000 }],
    });
    expect(screen.getByText("Sam can take out at most £30 a month")).toBeInTheDocument();
  });
});
