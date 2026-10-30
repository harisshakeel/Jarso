import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HistoryItem } from "../types";
import { HistoryList } from "./history-list";

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
