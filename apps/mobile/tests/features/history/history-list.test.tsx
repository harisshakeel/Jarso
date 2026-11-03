import { notEnoughSaveMessage, notEnoughSpendToUndoMessage } from "@jarso/core/diary";
import type { HistoryItem } from "@jarso/core/ledger";
import { AppError } from "@jarso/core/lib";
import { undoEntry } from "@jarso/data/diary";
import { getFamilyContext } from "@jarso/data/family";
import { getHistoryPage } from "@jarso/data/ledger";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { HistoryList } from "@/features/history";
import { apiFetch } from "@/lib/api";
import { keys } from "@/lib/query";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/ledger", () => ({
  getHistoryPage: jest.fn(),
  getJars: jest.fn().mockResolvedValue({}),
}));
jest.mock("@jarso/data/requests", () => ({ getAvailability: jest.fn().mockResolvedValue({}) }));
jest.mock("@jarso/data/diary", () => ({ undoEntry: jest.fn() }));
jest.mock("@jarso/data/family", () => ({ getFamilyContext: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: "success" },
}));

const page = getHistoryPage as jest.Mock;
const undo = undoEntry as jest.Mock;
const context = getFamilyContext as jest.Mock;
const dispatch = apiFetch as jest.Mock;

function item(over: Partial<HistoryItem> & Pick<HistoryItem, "id" | "kind">): HistoryItem {
  return {
    amountMinor: 500,
    dueMinor: null,
    label: "Thing",
    occurredOn: "2026-11-02",
    undone: false,
    entryId: null,
    canUndo: false,
    paidByCard: false,
    category: null,
    jar: null,
    canFix: false,
    fixedFrom: null,
    ...over,
  };
}

async function renderHistory() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  const invalidate = jest.spyOn(client, "invalidateQueries");
  const view = await render(
    <QueryClientProvider client={client}>
      <HistoryList />
    </QueryClientProvider>,
  );
  return { client, invalidate, ...view };
}

beforeEach(() => {
  jest.clearAllMocks();
  dispatch.mockResolvedValue(undefined);
  context.mockResolvedValue({ currency: "GBP", timezone: "Europe/London", today: "2026-11-02" });
});

describe("HistoryList", () => {
  it("starts the story when there is nothing yet", async () => {
    page.mockResolvedValue({ items: [], olderBefore: null });
    await renderHistory();
    expect(await screen.findByText("Your money story starts here.")).toBeOnTheScreen();
  });

  it("reads the page with the family's timezone and the current time", async () => {
    page.mockResolvedValue({ items: [], olderBefore: null });
    await renderHistory();
    await screen.findByText("Your money story starts here.");
    expect(page).toHaveBeenCalledWith({ id: "client" }, "child-1", {
      timezone: "Europe/London",
      now: expect.any(Number),
      before: undefined,
    });
  });

  it("labels every kind in the web's words", async () => {
    page.mockResolvedValue({
      items: [
        item({ id: "1", kind: "allowance", label: "Allowance", amountMinor: 1000 }),
        item({ id: "2", kind: "gift", label: "Gift" }),
        item({ id: "3", kind: "gift", label: "From Gran" }),
        item({ id: "4", kind: "extra", label: "Bike" }),
        item({ id: "5", kind: "received", label: "Pocket", jar: "save", category: "other" }),
        item({ id: "6", kind: "purchase", label: "Sweets", category: "snacks" }),
        item({ id: "7", kind: "withdrawal", label: "Taken out of Save" }),
        item({ id: "8", kind: "deposit", label: "Put into Save" }),
        item({ id: "9", kind: "skipped", label: "Allowance", amountMinor: null }),
      ],
      olderBefore: null,
    });
    await renderHistory();

    expect(await screen.findByText("Came in · 2 Nov")).toBeOnTheScreen();
    expect(screen.getAllByText("Gift · 2 Nov")).toHaveLength(2);
    expect(screen.getByText("From Gran")).toBeOnTheScreen();
    expect(screen.getByText("Extra money · 2 Nov")).toBeOnTheScreen();
    expect(screen.getByText("Got · into Save · 2 Nov")).toBeOnTheScreen();
    expect(screen.getByText("Spent · 2 Nov")).toBeOnTheScreen();
    expect(screen.getByText("Moved from Save to Spend · 2 Nov")).toBeOnTheScreen();
    expect(screen.getByText("Moved into Save · 2 Nov")).toBeOnTheScreen();
    expect(screen.getByText("Skipped")).toBeOnTheScreen();
  });

  it("shows a shortfall as 'given of due', paid by card and fixed notes", async () => {
    page.mockResolvedValue({
      items: [
        item({ id: "1", kind: "allowance", label: "Allowance", amountMinor: 300, dueMinor: 500 }),
        item({ id: "2", kind: "gift", label: "Gift", paidByCard: true }),
        item({
          id: "3",
          kind: "purchase",
          label: "Sweets",
          amountMinor: 400,
          category: "snacks",
          fixedFrom: { amountMinor: 500, category: "snacks", label: "Sweets" },
        }),
      ],
      olderBefore: null,
    });
    await renderHistory();

    expect(await screen.findByText("£3 of £5")).toBeOnTheScreen();
    expect(screen.getByText("Gift · 2 Nov · Paid by card")).toBeOnTheScreen();
    expect(screen.getByText("Spent · 2 Nov · Fixed · was £5")).toBeOnTheScreen();
  });

  it("marks an undone line and gives it no Undo", async () => {
    page.mockResolvedValue({
      items: [item({ id: "1", kind: "purchase", label: "Sweets", undone: true, entryId: "e1" })],
      olderBefore: null,
    });
    await renderHistory();

    expect(await screen.findByText("Spent · 2 Nov · Undone")).toBeOnTheScreen();
    expect(screen.getByLabelText("£5 (undone)")).toBeOnTheScreen();
    expect(screen.queryByText("Undo")).not.toBeOnTheScreen();
  });

  it("loads the next page at the end and stops when olderBefore is null", async () => {
    page.mockResolvedValueOnce({
      items: [item({ id: "1", kind: "purchase", label: "First" })],
      olderBefore: "2026-11-01T00:00:00Z",
    });
    page.mockResolvedValueOnce({
      items: [item({ id: "2", kind: "purchase", label: "Second" })],
      olderBefore: null,
    });
    await renderHistory();
    const listView = await screen.findByTestId("history-list");
    expect(await screen.findByText("First")).toBeOnTheScreen();

    fireEvent(listView, "endReached");
    expect(await screen.findByText("Second")).toBeOnTheScreen();
    expect(page).toHaveBeenLastCalledWith(
      { id: "client" },
      "child-1",
      expect.objectContaining({ before: "2026-11-01T00:00:00Z" }),
    );

    fireEvent(listView, "endReached");
    await waitFor(() => expect(page).toHaveBeenCalledTimes(2));
    expect(screen.getByText("First")).toBeOnTheScreen();
  });

  it("shows the safe message when the history cannot load, with Try again", async () => {
    page.mockRejectedValueOnce(new AppError("INTERNAL", "Something went wrong. Try again."));
    await renderHistory();
    expect(await screen.findByText("Something went wrong. Try again.")).toBeOnTheScreen();
    page.mockResolvedValue({ items: [], olderBefore: null });
    await userEvent.setup().press(screen.getByLabelText("Try again"));
    expect(await screen.findByText("Your money story starts here.")).toBeOnTheScreen();
  });
});

describe("Undo on a history line", () => {
  const undoable = () =>
    page.mockResolvedValue({
      items: [
        item({ id: "1", kind: "purchase", label: "Sweets", entryId: "entry-1", canUndo: true }),
        item({ id: "2", kind: "purchase", label: "Old", entryId: "entry-2", canUndo: false }),
      ],
      olderBefore: null,
    });

  it("shows Undo only where canUndo is true", async () => {
    undoable();
    await renderHistory();
    await screen.findByText("Sweets");
    expect(screen.getAllByText("Undo")).toHaveLength(1);
  });

  it("undoes, refreshes Home and History, tells the parent", async () => {
    undoable();
    undo.mockResolvedValue("undone");
    const { invalidate } = await renderHistory();
    const user = userEvent.setup();

    await user.press(await screen.findByLabelText("Undo Sweets"));

    expect(await screen.findByText("Undone. The money is back in Spend.")).toBeOnTheScreen();
    expect(undo).toHaveBeenCalledWith({ id: "client" }, "entry-1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.home("child-1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.history("child-1") });
    expect(dispatch).toHaveBeenCalledWith("/api/v1/notices/dispatch", expect.anything());
    expect(Haptics.notificationAsync).toHaveBeenCalled();
  });

  it("says it came out of the jar for money received", async () => {
    page.mockResolvedValue({
      items: [item({ id: "1", kind: "received", label: "Gran", entryId: "e", canUndo: true })],
      olderBefore: null,
    });
    undo.mockResolvedValue("undone");
    await renderHistory();
    await userEvent.setup().press(await screen.findByLabelText("Undo Gran"));
    expect(await screen.findByText("Undone. It's out of your jar.")).toBeOnTheScreen();
  });

  it.each([
    ["not_enough_spend", notEnoughSpendToUndoMessage],
    ["not_enough_save", notEnoughSaveMessage],
  ])("says why when %s, with no refresh", async (result, message) => {
    undoable();
    undo.mockResolvedValue(result);
    const { invalidate } = await renderHistory();
    await userEvent.setup().press(await screen.findByLabelText("Undo Sweets"));
    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(dispatch).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: keys.home("child-1") });
  });

  it("says calmly when it is too late", async () => {
    undoable();
    undo.mockRejectedValue(new AppError("CONFLICT", "You can only undo within a day."));
    await renderHistory();
    await userEvent.setup().press(await screen.findByLabelText("Undo Sweets"));
    expect(await screen.findByText("You can only undo within a day.")).toBeOnTheScreen();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("sends one undo for a double press in the same frame", async () => {
    undoable();
    let resolve: (v: string) => void = () => undefined;
    undo.mockReturnValue(new Promise((r) => (resolve = r)));
    await renderHistory();
    const button = await screen.findByLabelText("Undo Sweets");

    // Both presses start before React re-renders, which is what overlaps act() calls.
    const quiet = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await Promise.all([fireEvent.press(button), fireEvent.press(button)]);
    quiet.mockRestore();
    expect(undo).toHaveBeenCalledTimes(1);
    resolve("undone");
    expect(await screen.findByText("Undone. The money is back in Spend.")).toBeOnTheScreen();
  });
});
