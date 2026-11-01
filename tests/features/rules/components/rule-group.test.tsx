import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuleGroup } from "@/features/rules/components/rule-group";

const { setRuleAction } = vi.hoisted(() => ({ setRuleAction: vi.fn() }));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/features/rules/server/actions", () => ({ setRuleAction, setOverspendAction: vi.fn() }));

beforeEach(() => {
  setRuleAction.mockReset();
  setRuleAction.mockResolvedValue({ ok: true, data: undefined });
});
afterEach(cleanup);

function show(rules: { period: "item" | "week" | "month"; amountMinor: number }[] = []) {
  render(
    <RuleGroup
      childId="c1"
      nickname="Sam"
      currency="GBP"
      kind="spend_limit"
      rules={rules.map((rule) => ({ kind: "spend_limit", ...rule }))}
      addLabel="Add a spending limit"
      emptyLine="Add one to get a note."
    />,
  );
}

describe("RuleGroup", () => {
  it("adds a rule: a period chip, an amount, Save, then the sentence", async () => {
    show();
    expect(screen.getByText("Add one to get a note.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add a spending limit" }));
    fireEvent.click(screen.getByRole("radio", { name: "A week" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Tell me when Sam spends more than £10 a week"),
    ).toBeInTheDocument();
    expect(setRuleAction).toHaveBeenCalledWith(null, {
      childId: "c1",
      kind: "spend_limit",
      period: "week",
      amount: "10",
    });
    expect(screen.queryByText("Add one to get a note.")).toBeNull();
  });

  it("removes a rule by sending an empty amount", async () => {
    show([{ period: "week", amountMinor: 1000 }]);
    fireEvent.click(screen.getByRole("button", { name: /^Remove: / }));
    await waitFor(() =>
      expect(setRuleAction).toHaveBeenLastCalledWith(null, {
        childId: "c1",
        kind: "spend_limit",
        period: "week",
        amount: "",
      }),
    );
    expect(await screen.findByText("Add one to get a note.")).toBeInTheDocument();
  });

  it("changes a rule in place", async () => {
    show([{ period: "week", amountMinor: 1000 }]);
    fireEvent.click(screen.getByRole("button", { name: /^Change: / }));
    const amount = screen.getByLabelText("Amount");
    expect(amount).toHaveValue("10.00");
    fireEvent.change(amount, { target: { value: "12.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Tell me when Sam spends more than £12.50 a week"),
    ).toBeInTheDocument();
  });

  it("offers only the periods that are still free", () => {
    show([{ period: "week", amountMinor: 1000 }]);
    fireEvent.click(screen.getByRole("button", { name: "Add a spending limit" }));
    expect(screen.getByRole("radio", { name: "Each time" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "A month" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "A week" })).toBeNull();
  });

  it("shows a field error from the server beside the amount", async () => {
    setRuleAction.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION", message: "x", fieldErrors: { amount: ["Enter an amount."] } },
    });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Add a spending limit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter an amount.")).toBeInTheDocument();
  });
});
