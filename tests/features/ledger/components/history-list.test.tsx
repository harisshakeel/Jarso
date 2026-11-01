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
  category: null,
  jar: null,
  canFix: false,
  fixedFrom: null,
  ...over,
});

describe("HistoryList purchases", () => {
  it("shows a purchase with its label, the word Spent and no minus sign", () => {
    render(<HistoryList items={[purchase()]} currency="GBP" showMinor="always" />);
    expect(screen.getByText("Snack")).toBeInTheDocument();
    expect(screen.getByText(/^Spent · /)).toBeInTheDocument();
    expect(screen.getByText(/£3\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/[+−]£3/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Undone/)).not.toBeInTheDocument();
  });

  it("says Undone and fades the line instead of striking the amount", () => {
    render(
      <HistoryList
        items={[purchase({ undone: true, canUndo: false })]}
        currency="GBP"
        showMinor="always"
      />,
    );
    expect(screen.getByText(/· Undone/)).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveClass("opacity-70");
    expect(screen.getByText(/£3\.00/)).not.toHaveClass("line-through");
  });
});

describe("HistoryList jar moves", () => {
  const move = (kind: "withdrawal" | "deposit"): HistoryItem =>
    purchase({ id: "m1", kind, label: "New bike", canUndo: false, entryId: null });

  it("shows a take-out in words, not as money in and not with an arrow", () => {
    render(<HistoryList items={[move("withdrawal")]} currency="GBP" showMinor="always" />);
    expect(screen.getByText(/Moved from Save to Spend/)).toBeInTheDocument();
    expect(screen.getByText("£3.00")).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
    expect(screen.queryByText(/[+−]£3/)).not.toBeInTheDocument();
  });

  it("shows a put-in as moved into Save", () => {
    render(<HistoryList items={[move("deposit")]} currency="GBP" showMinor="always" />);
    expect(screen.getByText(/Moved into Save/)).toBeInTheDocument();
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

describe("HistoryList allowances and misses", () => {
  it("shows a short handover gently and a miss with the given word", () => {
    render(
      <HistoryList
        items={[
          purchase({
            id: "a1",
            kind: "allowance",
            label: "Allowance",
            amountMinor: 400,
            dueMinor: 500,
            canUndo: false,
            entryId: null,
          }),
          purchase({
            id: "s1",
            kind: "skipped",
            label: "Allowance",
            amountMinor: null,
            canUndo: false,
            entryId: null,
          }),
        ]}
        currency="GBP"
        showMinor="always"
        skippedLabel="Not given"
      />,
    );
    expect(screen.getByText("£4.00 of £5.00")).toBeInTheDocument();
    expect(screen.getByText(/^Came in · /)).toBeInTheDocument();
    expect(screen.getByText("Not given")).toBeInTheDocument();
  });

  it("has an empty line the caller can name", () => {
    render(<HistoryList items={[]} currency="GBP" emptyLine="Maya's money story starts here." />);
    expect(screen.getByText("Maya's money story starts here.")).toBeInTheDocument();
  });
});

describe("HistoryList categories and fixes", () => {
  it("shows the category emoji and the Fixed note with what changed", () => {
    render(
      <HistoryList
        items={[
          purchase({
            amountMinor: 350,
            category: "snacks",
            fixedFrom: { amountMinor: 500, category: "snacks", label: "" },
          }),
        ]}
        currency="GBP"
        showMinor="always"
      />,
    );
    expect(screen.getByText("🍫")).toBeInTheDocument();
    expect(screen.getByText(/Fixed · was £5\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/Fixed · was.*Snacks/)).not.toBeInTheDocument();
  });

  it("names the old category when only the category changed", () => {
    render(
      <HistoryList
        items={[
          purchase({
            category: "games",
            fixedFrom: { amountMinor: 300, category: "snacks", label: "" },
          }),
        ]}
        currency="GBP"
        showMinor="always"
      />,
    );
    expect(screen.getByText(/Fixed · was Snacks/)).toBeInTheDocument();
  });

  it("marks each row relative so a stretched action covers the whole line", () => {
    render(<HistoryList items={[purchase()]} currency="GBP" />);
    expect(screen.getByRole("listitem")).toHaveClass("relative");
  });

  it("says Got and shows the received emoji", () => {
    render(
      <HistoryList
        items={[purchase({ kind: "received", category: "birthday", label: "Nan" })]}
        currency="GBP"
      />,
    );
    expect(screen.getByText("🎂")).toBeInTheDocument();
    expect(screen.getByText(/^Got · /)).toBeInTheDocument();
  });

  it("names the jar money received went into", () => {
    render(
      <HistoryList
        items={[
          purchase({ id: "a", kind: "received", category: "birthday", jar: "save" }),
          purchase({ id: "b", kind: "received", category: "job", jar: "spend" }),
        ]}
        currency="GBP"
      />,
    );
    expect(screen.getByText(/^Got · into Save · /)).toBeInTheDocument();
    expect(screen.getByText(/^Got · into Spend · /)).toBeInTheDocument();
  });
});
