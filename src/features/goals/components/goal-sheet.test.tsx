import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { archiveGoalAction, saveGoalAction } from "../server/actions";
import type { Goal } from "../types";
import { GoalSheet } from "./goal-sheet";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../server/actions", () => ({ saveGoalAction: vi.fn(), archiveGoalAction: vi.fn() }));

const goal: Goal = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Football boots",
  emoji: "⚽",
  targetMinor: 4500,
  planMinor: 400,
  reachedAt: null,
  celebratedAt: null,
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function openNew(props: { saveMinor?: number; reservedMinor?: number } = {}) {
  render(
    <GoalSheet
      goal={null}
      currency="GBP"
      allowanceMinor={500}
      saveMinor={props.saveMinor ?? 2600}
      reservedMinor={props.reservedMinor ?? 0}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Set a goal" }));
}

function fill(price: string, plan: string) {
  fireEvent.change(screen.getByLabelText("What is it?"), { target: { value: "Football boots" } });
  fireEvent.click(screen.getByRole("radio", { name: "⚽" }));
  fireEvent.change(screen.getByLabelText("How much does it cost?"), { target: { value: price } });
  fireEvent.change(screen.getByLabelText("How much will you save each time?"), {
    target: { value: plan },
  });
}

describe("GoalSheet", () => {
  it("previews how many allowances it will take from counted Save", () => {
    openNew();
    fill("45", "4");
    expect(screen.getByText("About 5 more allowances")).toBeInTheDocument();
  });

  it("counts Save less money waiting to come out in the preview", () => {
    openNew({ saveMinor: 3100, reservedMinor: 1300 });
    fill("45", "4");
    // 3100 − 1300 = 1800 counted, 2700 to go at 4 a time.
    expect(screen.getByText("About 7 more allowances")).toBeInTheDocument();
  });

  it("asks for a plan when there is none", () => {
    openNew();
    fill("45", "");
    expect(
      screen.getByText("Set how much you'll save each time to see how long it'll take"),
    ).toBeInTheDocument();
  });

  it("sends the name, emoji, price and plan", async () => {
    vi.mocked(saveGoalAction).mockResolvedValue({ ok: true, data: goal.id });
    openNew();
    fill("45", "4");
    fireEvent.click(screen.getByRole("button", { name: "Save my goal" }));
    await waitFor(() => expect(saveGoalAction).toHaveBeenCalled());
    expect(vi.mocked(saveGoalAction).mock.calls[0]?.[1]).toEqual({
      name: "Football boots",
      emoji: "⚽",
      target: "45",
      plan: "4",
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("shows a plan that is too big under the plan field", async () => {
    const message = "That's more than your allowance. Try a smaller amount.";
    vi.mocked(saveGoalAction).mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION", message, fieldErrors: { plan: [message] } },
    });
    openNew();
    fill("45", "6");
    fireEvent.click(screen.getByRole("button", { name: "Save my goal" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText("How much will you save each time?")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("starts a new goal only after confirming", async () => {
    vi.mocked(archiveGoalAction).mockResolvedValue({ ok: true, data: undefined });
    render(
      <GoalSheet
        goal={goal}
        currency="GBP"
        allowanceMinor={500}
        saveMinor={2600}
        reservedMinor={0}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change my goal" }));
    expect(screen.getByLabelText("What is it?")).toHaveValue("Football boots");
    fireEvent.click(screen.getByRole("button", { name: "Start a new goal" }));
    expect(archiveGoalAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, start a new goal" }));
    await waitFor(() => expect(archiveGoalAction).toHaveBeenCalledWith(null, { goalId: goal.id }));
  });

  it("shows the allowance hint in the family currency", () => {
    openNew();
    expect(screen.getByText("Up to £5 from each allowance.")).toBeInTheDocument();
  });
});
