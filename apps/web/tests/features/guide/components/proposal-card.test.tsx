import type { GoalProposal } from "@jarso/core/guide";
import { guideCopy } from "@jarso/core/guide";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProposalCard } from "@/features/guide/components/proposal-card";

const { acceptGoalProposalAction } = vi.hoisted(() => ({ acceptGoalProposalAction: vi.fn() }));

vi.mock("@/features/guide/server/actions", () => ({ acceptGoalProposalAction }));
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
