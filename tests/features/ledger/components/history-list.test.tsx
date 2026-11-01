import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HistoryList } from "@/features/ledger/components/history-list";
import type { HistoryItem } from "@/features/ledger/types";

afterEach(cleanup);

const purchase = (over: Partial<HistoryItem> = {}): HistoryItem => ({
  id: "p1",
  kind: "purchase",
  amountMinor: 300,
  dueMinor: null,
  label: "Snack",
  occurredOn: "2026-11-01",
  undone: false,
  entryId: "p1",
  canUndo: true,
  paidByCard: false,
  ...over,
});

describe("HistoryList purchases", () => {
  it("shows a purchase as money out", () => {
    render(<HistoryList items={[purchase()]} currency="GBP" showMinor="always" />);
    expect(screen.getByText("Snack")).toBeInTheDocument();
    expect(screen.getByText("−£3.00")).not.toHaveClass("line-through");
    expect(screen.queryByText(/Undone/)).not.toBeInTheDocument();
  });

  it("labels an undone purchase and strikes its amount", () => {
    render(
      <HistoryList
        items={[purchase({ undone: true, canUndo: false })]}
        currency="GBP"
        showMinor="always"
      />,
    );
    expect(screen.getByText(/Undone/)).toBeInTheDocument();
    expect(screen.getByText("−£3.00")).toHaveClass("line-through");
  });
});

describe("HistoryList jar moves", () => {
  const move = (kind: "withdrawal" | "deposit"): HistoryItem =>
    purchase({ id: "m1", kind, label: "New bike", canUndo: false, entryId: null });

  it("shows a take-out as a move from Save to Spend, not as money in", () => {
    render(<HistoryList items={[move("withdrawal")]} currency="GBP" showMinor="always" />);
    expect(screen.getByText(/Save → Spend/)).toBeInTheDocument();
    expect(screen.getByText("£3.00")).toBeInTheDocument();
    expect(screen.queryByText(/[+−]£3/)).not.toBeInTheDocument();
  });

  it("shows a put-in as a move from Spend to Save", () => {
    render(<HistoryList items={[move("deposit")]} currency="GBP" showMinor="always" />);
    expect(screen.getByText(/Spend → Save/)).toBeInTheDocument();
    expect(screen.queryByText(/[+−]£3/)).not.toBeInTheDocument();
  });

  it("shows an emergency grant as extra money with its reason", () => {
    const extra: HistoryItem = purchase({
      id: "g1",
      kind: "extra",
      label: "School trip",
      canUndo: false,
      entryId: null,
    });
    render(<HistoryList items={[extra]} currency="GBP" showMinor="always" />);
    expect(screen.getByText(/Extra money/)).toBeInTheDocument();
    expect(screen.getByText("School trip")).toBeInTheDocument();
    expect(screen.getByText("£3.00")).toBeInTheDocument();
  });
});

describe("HistoryList paid by card", () => {
  const allowance = (paidByCard: boolean): HistoryItem =>
    purchase({ id: "a1", kind: "allowance", label: "Allowance", canUndo: false, paidByCard });

  it("adds Paid by card to a handover paid by card", () => {
    render(<HistoryList items={[allowance(true)]} currency="GBP" />);
    expect(screen.getByText(/· Paid by card/)).toBeInTheDocument();
  });

  it("adds nothing to a cash handover", () => {
    render(<HistoryList items={[allowance(false)]} currency="GBP" />);
    expect(screen.queryByText(/Paid by card/)).not.toBeInTheDocument();
  });
});
