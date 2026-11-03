import type { ActionProposal, GoalProposal } from "@jarso/core/guide";
import { guideCopy } from "@jarso/core/guide";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProposalCard } from "@/features/guide/components/proposal-card";

const { acceptGoalProposalAction, confirmActionDraftAction } = vi.hoisted(() => ({
  acceptGoalProposalAction: vi.fn(),
  confirmActionDraftAction: vi.fn(),
}));

vi.mock("@/features/guide/server/actions", () => ({
  acceptGoalProposalAction,
  confirmActionDraftAction,
}));
vi.mock("@/features/offline", () => ({
  runOnline: (action: () => Promise<unknown>) => action(),
}));

const proposal: GoalProposal = {
  kind: "goal",
  title: "Headphones",
  emoji: "🎧",
  priceMinor: 3000,
  saveEachMinor: 500,
  allowances: 6,
  figures: "£30 · £5 each allowance · about 6 allowances",
};
const copy = guideCopy.proposal;

/** A full run is busy; a save that takes two round trips can need more than a second. */
const wait = { timeout: 5_000 };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("ProposalCard", () => {
  it("shows the goal Jarso offered and saves it only when the child taps", async () => {
    acceptGoalProposalAction.mockResolvedValue({
      ok: true,
      data: { status: "saved", goalId: "g1", planKept: true },
    });
    render(<ProposalCard proposal={proposal} />);
    expect(screen.getByRole("region", { name: copy.title })).toBeVisible();
    expect(screen.getByText("Headphones")).toBeVisible();
    expect(screen.getByText(proposal.figures)).toBeVisible();
    expect(acceptGoalProposalAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: copy.make }));
    expect(await screen.findByText(copy.saved, { exact: false }, wait)).toBeVisible();
    expect(acceptGoalProposalAction).toHaveBeenCalledWith(null, {
      title: "Headphones",
      emoji: "🎧",
      priceMinor: 3000,
      saveEachMinor: 500,
      replace: false,
    });
    expect(screen.getByRole("link", { name: copy.see })).toHaveAttribute("href", "/child/goal");
  });

  it("asks before swapping a goal the child already has", async () => {
    acceptGoalProposalAction
      .mockResolvedValueOnce({ ok: true, data: { status: "has_goal", existing: "Bike" } })
      .mockResolvedValueOnce({
        ok: true,
        data: { status: "saved", goalId: "g2", planKept: true },
      });
    render(<ProposalCard proposal={proposal} />);
    fireEvent.click(screen.getByRole("button", { name: copy.make }));
    expect(await screen.findByText(copy.hasGoal("Bike"), {}, wait)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: copy.replace }));
    expect(await screen.findByText(copy.saved, { exact: false }, wait)).toBeVisible();
    expect(acceptGoalProposalAction).toHaveBeenLastCalledWith(
      null,
      expect.objectContaining({ replace: true }),
    );
  });

  it("goes away on Not now, saving nothing", () => {
    render(<ProposalCard proposal={proposal} />);
    fireEvent.click(screen.getByRole("button", { name: copy.notNow }));
    expect(screen.queryByRole("region", { name: copy.title })).toBeNull();
    expect(acceptGoalProposalAction).not.toHaveBeenCalled();
  });

  it("shows the reason when the goal couldn't be saved", async () => {
    acceptGoalProposalAction.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION", message: "We couldn't save your goal." },
    });
    render(<ProposalCard proposal={proposal} />);
    fireEvent.click(screen.getByRole("button", { name: copy.make }));
    expect(await screen.findByRole("alert", {}, wait)).toHaveTextContent(
      "We couldn't save your goal.",
    );
    expect(screen.getByRole("button", { name: copy.make })).toBeVisible();
  });
});

const action: ActionProposal = {
  kind: "action",
  draft: {
    kind: "money_received",
    id: "00000000-0000-4000-8000-0000000000a1",
    amountMinor: 500,
    jar: "save",
    category: "family",
    label: "Grandma",
  },
  title: "Write down money you got",
  lines: [
    { label: "Amount", value: "£5" },
    { label: "Into", value: "Save" },
    { label: "From", value: "Grandma" },
  ],
};
const actionCopy = guideCopy.action;

describe("ProposalCard for an action", () => {
  it("shows every field plainly and runs the action only on Do it, once", async () => {
    confirmActionDraftAction.mockResolvedValue({
      ok: true,
      data: {
        status: "done",
        text: "Done: £5 is written down in Save.",
        figures: { spend: "£12.40", save: "£69" },
      },
    });
    const onOutcome = vi.fn();
    render(<ProposalCard proposal={action} onOutcome={onOutcome} />);
    expect(screen.getByRole("region", { name: action.title })).toBeVisible();
    expect(screen.getByText("Amount")).toBeVisible();
    expect(screen.getByText("£5")).toBeVisible();
    expect(screen.getByText("Grandma")).toBeVisible();
    expect(confirmActionDraftAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: actionCopy.doIt }));
    expect(await screen.findByText("Done: £5 is written down in Save.", {}, wait)).toBeVisible();
    expect(screen.getByText("Spend £12.40 · Save £69")).toBeVisible();
    expect(confirmActionDraftAction).toHaveBeenCalledTimes(1);
    expect(confirmActionDraftAction).toHaveBeenCalledWith(null, { draft: action.draft });
    expect(onOutcome).toHaveBeenCalledWith(expect.objectContaining({ status: "done" }));
    // No second tap: the buttons are gone once there is an outcome.
    expect(screen.queryByRole("button", { name: actionCopy.doIt })).toBeNull();
  });

  it("says when it is waiting for a parent", async () => {
    confirmActionDraftAction.mockResolvedValue({
      ok: true,
      data: {
        status: "waiting",
        text: "Sent: your parent will look at taking £3 out of Save.",
        figures: null,
      },
    });
    render(<ProposalCard proposal={action} />);
    fireEvent.click(screen.getByRole("button", { name: actionCopy.doIt }));
    expect(await screen.findByRole("status", {}, wait)).toHaveTextContent(
      "Sent: your parent will look at taking £3 out of Save.",
    );
  });

  it("shows a refusal with its safe message", async () => {
    confirmActionDraftAction.mockResolvedValue({
      ok: false,
      error: { code: "CONFLICT", message: "This allowance has stopped. Set up a new one." },
    });
    const onOutcome = vi.fn();
    render(<ProposalCard proposal={action} onOutcome={onOutcome} />);
    fireEvent.click(screen.getByRole("button", { name: actionCopy.doIt }));
    expect(await screen.findByRole("alert", {}, wait)).toHaveTextContent(
      "This allowance has stopped. Set up a new one.",
    );
    expect(onOutcome).toHaveBeenCalledWith({
      status: "declined",
      text: "This allowance has stopped. Set up a new one.",
      figures: null,
    });
  });

  it("hands the thread a line to finish on Change something, running nothing", () => {
    const onChange = vi.fn();
    render(<ProposalCard proposal={action} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: actionCopy.change }));
    expect(onChange).toHaveBeenCalledWith(actionCopy.changePrompt);
    expect(confirmActionDraftAction).not.toHaveBeenCalled();
  });

  it("leaves out Change something when the thread can't take the line", () => {
    render(<ProposalCard proposal={action} />);
    expect(screen.queryByRole("button", { name: actionCopy.change })).toBeNull();
  });
});
