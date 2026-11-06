import {
  entryDetailCopy,
  fixRefusalMessage,
  receivedFlowCopy,
  unchangedMessage,
} from "@jarso/core/diary";
import type { HistoryItem } from "@jarso/core/ledger";
import { AppError } from "@jarso/core/lib";
import {
  callCorrectDiaryEntry,
  callListEntryVersions,
  callRecordMoneyReceived,
} from "@jarso/data/diary";
import { getFamilyContext } from "@jarso/data/family";
import { getGoalView } from "@jarso/data/goals";
import { getHistoryPage, getJars } from "@jarso/data/ledger";
import { getProgress } from "@jarso/data/progress";
import { getAvailability } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { EntryDetail, FixForm, ReceivedSheet } from "@/features/diary";
import { HistoryList } from "@/features/history";
import { apiFetch } from "@/lib/api";
import { keys } from "@/lib/query";
import { renderFlow } from "../../flow-render";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@jarso/data/goals", () => ({ getGoalView: jest.fn() }));
jest.mock("@jarso/data/progress", () => ({ getProgress: jest.fn() }));
jest.mock("@/lib/sound", () => ({ playSound: jest.fn(), getSoundOn: jest.fn(async () => true) }));
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/diary", () => ({
  callRecordMoneyReceived: jest.fn(),
  callCorrectDiaryEntry: jest.fn(),
  callListEntryVersions: jest.fn(),
  undoEntry: jest.fn(),
}));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn(), getHistoryPage: jest.fn() }));
jest.mock("@jarso/data/requests", () => ({ getAvailability: jest.fn() }));
jest.mock("@jarso/data/family", () => ({
  getFamilyContext: jest.fn(),
  findParentLabels: jest.fn(async () => ["Mum"]),
}));
jest.mock("expo-router", () => ({ useRouter: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "33333333-3333-4333-8333-333333333333" }));
jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: "success" },
}));

const KEY = "33333333-3333-4333-8333-333333333333";
const ENTRY = "44444444-4444-4444-8444-444444444444";
const push = jest.fn();
const received = callRecordMoneyReceived as jest.Mock;
const correct = callCorrectDiaryEntry as jest.Mock;
const versions = callListEntryVersions as jest.Mock;

function line(over: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: "row-1",
    kind: "purchase",
    amountMinor: 500,
    dueMinor: null,
    label: "Crisps",
    occurredOn: "2026-11-03",
    undone: false,
    entryId: ENTRY,
    canUndo: false,
    paidByCard: false,
    category: "snacks",
    jar: "spend",
    canFix: true,
    fixedFrom: null,
    ...over,
  };
}

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  return { client, ui: <QueryClientProvider client={client}>{ui}</QueryClientProvider> };
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ push });
  (apiFetch as jest.Mock).mockResolvedValue(undefined);
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-03",
  });
  (getJars as jest.Mock).mockResolvedValue({ spend: 1000, save: 2000 });
  (getAvailability as jest.Mock).mockResolvedValue({});
  (getGoalView as jest.Mock).mockResolvedValue(null);
  (getProgress as jest.Mock).mockResolvedValue({ sparks: 10, streak: 1 });
});

type User = ReturnType<typeof userEvent.setup>;

const GOAL = {
  goal: { id: "g1", name: "Boots", emoji: "⚽", targetMinor: 5000, planMinor: null },
  progress: { countedMinor: 2000, remainingMinor: 3000, reached: false },
};

async function openReceived() {
  const onClose = jest.fn();
  const flow = await renderFlow(<ReceivedSheet onClose={onClose} />);
  return { onClose, ...flow };
}

/** Keys the amount, then Next. */
async function keyAmount(user: User, amount: string) {
  await screen.findByRole("button", { name: "Next" });
  for (const key of amount) await user.press(screen.getByRole("button", { name: key }));
  await user.press(screen.getByRole("button", { name: "Next" }));
}

describe("Got money", () => {
  it("needs a pick before Put it in", async () => {
    const user = userEvent.setup();
    await openReceived();
    await keyAmount(user, "5");
    expect(await screen.findByText("Got £5!")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Put it in Spend" })).toBeDisabled();
    await user.press(screen.getByRole("radio", { name: "Birthday" }));
    expect(screen.getByRole("button", { name: "Put it in Spend" })).toBeEnabled();
  });

  it("Spend is picked first and the button names the jar", async () => {
    const user = userEvent.setup();
    await openReceived();
    await keyAmount(user, "5");
    expect(await screen.findByRole("radio", { name: "Spend" })).toBeChecked();
    expect(screen.getByText(receivedFlowCopy.save.hint("Mum"))).toBeOnTheScreen();
    await user.press(screen.getByRole("radio", { name: "Save" }));
    expect(screen.getByRole("button", { name: "Put it in Save" })).toBeOnTheScreen();
  });

  it("Save shows the goal effect", async () => {
    (getGoalView as jest.Mock).mockResolvedValue(GOAL);
    const user = userEvent.setup();
    await openReceived();
    await keyAmount(user, "5");
    await screen.findByRole("radio", { name: "Save" });
    expect(screen.queryByText(/to go after this/)).toBeNull();
    await user.press(screen.getByRole("radio", { name: "Save" }));
    expect(await screen.findByText("⚽ Boots: £25 to go after this!")).toBeOnTheScreen();
  });

  it("records it once, refreshes and tells the parent", async () => {
    received.mockResolvedValue({ status: "recorded", entryId: ENTRY });
    const user = userEvent.setup();
    const { client } = await openReceived();
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await keyAmount(user, "5");
    await user.press(await screen.findByRole("radio", { name: "Birthday" }));
    await user.press(screen.getByRole("radio", { name: "Save" }));
    await user.press(screen.getByRole("button", { name: "Put it in Save" }));
    expect(await screen.findByText("Written down!")).toBeOnTheScreen();
    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith(
      { id: "client" },
      {
        childId: "child-1",
        amountMinor: 500,
        jar: "save",
        category: "birthday",
        label: "",
        idempotencyKey: KEY,
      },
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.home("child-1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.history("child-1") });
    expect(apiFetch).toHaveBeenCalledWith("/api/v1/notices/dispatch", {
      method: "POST",
      auth: true,
    });
  });

  it("celebrates without Undo and Nice leaves", async () => {
    received.mockResolvedValue({ status: "recorded", entryId: ENTRY });
    const user = userEvent.setup();
    const { onClose } = await openReceived();
    await keyAmount(user, "5");
    await user.press(await screen.findByRole("radio", { name: "Birthday" }));
    await user.press(screen.getByRole("button", { name: "Put it in Spend" }));
    expect(await screen.findByText("£5 · Birthday")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    await user.press(screen.getByRole("button", { name: "Nice" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("shows a refusal's safe message", async () => {
    received.mockRejectedValue(new AppError("CONFLICT", "That's too much in one go."));
    const user = userEvent.setup();
    await openReceived();
    await keyAmount(user, "5");
    await user.press(await screen.findByRole("radio", { name: "Birthday" }));
    await user.press(screen.getByRole("button", { name: "Put it in Spend" }));
    expect(await screen.findByText("That's too much in one go.")).toBeOnTheScreen();
    expect(screen.queryByText("Written down!")).toBeNull();
  });
});

describe("Fix a line", () => {
  it("fix unchanged shows unchangedMessage", async () => {
    correct.mockResolvedValue({ status: "unchanged" });
    const onDone = jest.fn();
    const user = userEvent.setup();
    await render(wrap(<FixForm item={line()} currency="GBP" onDone={onDone} />).ui);
    expect(screen.getByLabelText("Amount")).toHaveProp("value", "5.00");
    await user.press(screen.getByRole("button", { name: entryDetailCopy.saveFix }));
    expect(await screen.findByText(unchangedMessage)).toBeOnTheScreen();
    expect(correct).toHaveBeenCalledWith(
      { id: "client" },
      {
        entryId: ENTRY,
        amountMinor: 500,
        category: "snacks",
        label: "Crisps",
        idempotencyKey: KEY,
      },
    );
    expect(onDone).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("fix not enough spend shows the refusal", async () => {
    correct.mockResolvedValue({ status: "not_enough_spend", freeMinor: 200 });
    const user = userEvent.setup();
    await render(wrap(<FixForm item={line()} currency="GBP" onDone={jest.fn()} />).ui);
    const amount = screen.getByLabelText("Amount");
    await user.clear(amount);
    await user.type(amount, "9");
    await user.press(screen.getByRole("button", { name: entryDetailCopy.saveFix }));
    const refusal = fixRefusalMessage(
      { status: "not_enough_spend", freeMinor: 200 },
      "purchase",
      "GBP",
      500,
    ) as string;
    expect(await screen.findByText(refusal)).toBeOnTheScreen();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("a fixed line refreshes, tells the parent and closes", async () => {
    correct.mockResolvedValue({ status: "fixed", entryId: "new-entry" });
    const onDone = jest.fn();
    const user = userEvent.setup();
    const { client, ui } = wrap(<FixForm item={line()} currency="GBP" onDone={onDone} />);
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await render(ui);
    await user.press(screen.getByRole("radio", { name: "Games" }));
    await user.press(screen.getByRole("button", { name: entryDetailCopy.saveFix }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.history("child-1") });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});

describe("Entry detail", () => {
  it("earlier versions newest first, current hidden", async () => {
    versions.mockResolvedValue([
      { id: "v1", amountMinor: 300, category: "snacks", label: "Old crisps", createdAt: "1" },
      { id: "v2", amountMinor: 400, category: "games", label: "", createdAt: "2" },
      { id: ENTRY, amountMinor: 500, category: "snacks", label: "Crisps", createdAt: "3" },
    ]);
    const user = userEvent.setup();
    await render(wrap(<EntryDetail item={line()} currency="GBP" onClose={jest.fn()} />).ui);
    expect(screen.getByRole("button", { name: entryDetailCopy.fix })).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: entryDetailCopy.earlierVersions }));
    const rows = await screen.findAllByTestId("earlier-version");
    expect(rows.map((row) => row.props.children)).toEqual([
      "£4 · Games",
      "£3 · Snacks · Old crisps",
    ]);
    expect(versions).toHaveBeenCalledWith({ id: "client" }, ENTRY);
  });

  it("a fixed line opens with its earlier versions", async () => {
    versions.mockResolvedValue([]);
    await render(
      wrap(
        <EntryDetail
          item={line({ fixedFrom: { amountMinor: 300, category: "snacks", label: "x" } })}
          currency="GBP"
          onClose={jest.fn()}
        />,
      ).ui,
    );
    expect(await screen.findByText(entryDetailCopy.noEarlierVersions)).toBeOnTheScreen();
  });
});

describe("History rows", () => {
  it("row without fix/undo/fixedFrom does not open detail", async () => {
    (getHistoryPage as jest.Mock).mockResolvedValue({
      items: [
        line({ id: "a", label: "Fixable" }),
        line({ id: "b", label: "Allowance", kind: "allowance", canFix: false, entryId: null }),
        line({ id: "c", label: "Old one", canFix: false }),
      ],
      olderBefore: null,
    });
    const user = userEvent.setup();
    await render(wrap(<HistoryList />).ui);
    await user.press(
      await screen.findByRole("button", { name: entryDetailCopy.detailsFor("Fixable") }),
    );
    expect(push).toHaveBeenCalledWith(`/(child)/entry/${ENTRY}`);
    expect(
      screen.queryByRole("button", { name: entryDetailCopy.detailsFor("Allowance") }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: entryDetailCopy.detailsFor("Old one") }),
    ).toBeNull();
  });
});
