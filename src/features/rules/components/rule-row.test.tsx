import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RuleRow } from "./rule-row";

const { setRuleAction } = vi.hoisted(() => ({ setRuleAction: vi.fn() }));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("../server/actions", () => ({ setRuleAction, setOverspendAction: vi.fn() }));

beforeEach(() => {
  setRuleAction.mockReset();
  setRuleAction.mockResolvedValue({ ok: true, data: undefined });
});
afterEach(cleanup);

function renderRow() {
  render(<RuleRow childId="c1" nickname="Sam" currency="GBP" kind="spend_limit" period="week" />);
}

describe("RuleRow", () => {
  it("prompts for an amount when switched on", () => {
    renderRow();
    fireEvent.click(screen.getByRole("switch", { name: "A week" }));
    expect(screen.getByText("Set an amount, then Save")).toBeInTheDocument();
  });

  it("updates the sentence after save", async () => {
    renderRow();
    fireEvent.click(screen.getByRole("switch", { name: "A week" }));
    fireEvent.change(screen.getByLabelText("A week limit"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Tell me when Sam spends more than £10 a week"),
    ).toBeInTheDocument();
  });

  it("clears the rule on the server when switched off after saving", async () => {
    renderRow();
    fireEvent.click(screen.getByRole("switch", { name: "A week" }));
    fireEvent.change(screen.getByLabelText("A week limit"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText(/spends more than £10/);
    fireEvent.click(screen.getByRole("switch", { name: "A week" }));
    await waitFor(() => expect(setRuleAction).toHaveBeenCalledTimes(2));
    expect(setRuleAction).toHaveBeenLastCalledWith(null, {
      childId: "c1",
      kind: "spend_limit",
      period: "week",
      amount: "",
    });
    expect(await screen.findByText("A week: no limit")).toBeInTheDocument();
  });
});
