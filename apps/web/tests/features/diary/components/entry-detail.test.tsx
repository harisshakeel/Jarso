import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntryDetail } from "@/features/diary/components/entry-detail";
import type { HistoryItem } from "@/features/ledger";

const { fix, undo, versions, refresh } = vi.hoisted(() => ({
  fix: vi.fn(),
  undo: vi.fn(),
  versions: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  unstable_rethrow: (e: unknown) => {
    throw e;
  },
}));
vi.mock("@/features/diary/server/actions", () => ({
  correctDiaryEntryAction: fix,
  undoDiaryEntryAction: undo,
  listEntryVersionsAction: versions,
}));

beforeEach(() => {
  vi.clearAllMocks();
  versions.mockResolvedValue({ ok: true, data: [] });
});
afterEach(cleanup);

const item = (over: Partial<HistoryItem> = {}): HistoryItem => ({
  id: "p1",
  kind: "purchase",
  amountMinor: 550,
  dueMinor: null,
  label: "Comic",
  occurredOn: "2026-11-01",
  undone: false,
  entryId: "11111111-1111-4111-8111-111111111111",
  canUndo: true,
  paidByCard: false,
  category: "games",
  jar: null,
  canFix: true,
  fixedFrom: null,
  ...over,
});

function open(i: HistoryItem) {
  render(<EntryDetail item={i} currency="GBP" />);
  fireEvent.click(screen.getByRole("button", { name: /Details for/ }));
}

describe("EntryDetail", () => {
  it("has a 44px trigger named after the line that stretches over the row", () => {
    render(<EntryDetail item={item()} currency="GBP" />);
    const trigger = screen.getByRole("button", { name: "Details for Comic" });
    expect(trigger).toHaveClass("size-11", "after:absolute", "after:inset-0");
  });

  it("offers Earlier versions as a button on a line that was never fixed", () => {
    open(item());
    expect(screen.getByRole("button", { name: "Earlier versions" })).toBeInTheDocument();
    expect(versions).not.toHaveBeenCalled();
  });

  it("shows Fix this only when canFix and Undo only when canUndo", () => {
    open(item({ canFix: false }));
    expect(screen.queryByRole("button", { name: "Fix this" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    cleanup();
    open(item({ canUndo: false }));
    expect(screen.getByRole("button", { name: "Fix this" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("starts the fix form on the line's values with no jar picker", () => {
    open(item());
    fireEvent.click(screen.getByRole("button", { name: "Fix this" }));
    expect(screen.getByLabelText("Amount")).toHaveValue("5.50");
    expect(screen.getByRole("radio", { name: "Games" })).toBeChecked();
    expect(screen.getByLabelText(/Name it/)).toHaveValue("Comic");
    expect(screen.queryByText("Which jar?")).not.toBeInTheDocument();
    expect(
      screen.getByText("To move money between jars, put it in or take it out."),
    ).toBeInTheDocument();
  });

  it("sends the fix and says when nothing changed", async () => {
    fix.mockResolvedValue({ ok: true, data: { status: "unchanged" } });
    open(item());
    fireEvent.click(screen.getByRole("button", { name: "Fix this" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the fix" }));
    expect(await screen.findByText("Nothing changed.")).toBeInTheDocument();
    expect(fix).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        entryId: "11111111-1111-4111-8111-111111111111",
        amount: "5.50",
        category: "games",
      }),
    );
  });

  it("says a line cannot be fixed any more", async () => {
    fix.mockResolvedValue({ ok: true, data: { status: "not_fixable" } });
    open(item());
    fireEvent.click(screen.getByRole("button", { name: "Fix this" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the fix" }));
    expect(await screen.findByText("This one can't be fixed any more.")).toBeInTheDocument();
  });

  it("explains a spend shortfall on a fix with the free Spend", async () => {
    fix.mockResolvedValue({ ok: true, data: { status: "not_enough_spend", freeMinor: 200 } });
    open(item());
    fireEvent.click(screen.getByRole("button", { name: "Fix this" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the fix" }));
    expect(
      await screen.findByText("That's more than you have in Spend. The most it can be is £7.50."),
    ).toBeInTheDocument();
  });

  it("explains the least money received can be when Spend was used", async () => {
    fix.mockResolvedValue({ ok: true, data: { status: "not_enough_spend", freeMinor: 200 } });
    open(item({ kind: "received", category: "birthday" }));
    fireEvent.click(screen.getByRole("button", { name: "Fix this" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the fix" }));
    expect(
      await screen.findByText("You've spent some of this already. The least it can be is £3.50."),
    ).toBeInTheDocument();
  });

  it("explains a Save shortfall on a fix with fix words, not undo words", async () => {
    fix.mockResolvedValue({ ok: true, data: { status: "not_enough_save" } });
    open(item({ kind: "received", category: "birthday", jar: "save" }));
    fireEvent.click(screen.getByRole("button", { name: "Fix this" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the fix" }));
    expect(
      await screen.findByText(
        "Some of your Save is waiting to come out, so this can't be lowered right now.",
      ),
    ).toBeInTheDocument();
  });

  it("explains undoing money received that was already spent", async () => {
    undo.mockResolvedValue({ ok: true, data: "not_enough_spend" });
    open(item({ kind: "received", category: "birthday" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      await screen.findByText("You've spent some of this already, so it can't be undone."),
    ).toBeInTheDocument();
  });

  it("opens a fixed line with its earlier versions showing, greyed out, oldest last", async () => {
    versions.mockResolvedValue({
      ok: true,
      data: [
        {
          id: "a",
          amountMinor: 300,
          category: "snacks",
          label: "",
          createdAt: "2026-10-30T10:00:00Z",
        },
        {
          id: "b",
          amountMinor: 400,
          category: "games",
          label: "",
          createdAt: "2026-10-31T10:00:00Z",
        },
        {
          id: "11111111-1111-4111-8111-111111111111",
          amountMinor: 550,
          category: "games",
          label: "Comic",
          createdAt: "2026-11-01T10:00:00Z",
        },
      ],
    });
    open(item({ fixedFrom: { amountMinor: 400, category: "games", label: "" } }));
    await waitFor(() =>
      expect(versions).toHaveBeenCalledWith(null, {
        entryId: "11111111-1111-4111-8111-111111111111",
      }),
    );
    const rows = await screen.findAllByTestId("earlier-version");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("£4");
    expect(rows[1]).toHaveTextContent("£3");
    expect(rows[0]).toHaveClass("text-ink-2");
  });
});
