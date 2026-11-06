import { guessCopy } from "@jarso/core/home";
import { AppError } from "@jarso/core/lib";
import { offlineCopy } from "@jarso/core/offline";
import {
  askCelebration,
  depositMessage,
  overCapMessage,
  withdrawalMessage,
} from "@jarso/core/requests";
import { findParentLabels, getFamilyContext } from "@jarso/data/family";
import { getGoalView } from "@jarso/data/goals";
import { getJars } from "@jarso/data/ledger";
import { getProgress } from "@jarso/data/progress";
import {
  callCreateDeposit,
  callCreateEmergency,
  callCreateWithdrawal,
  getAvailability,
} from "@jarso/data/requests";
import { findChildRules } from "@jarso/data/rules";
import { QueryClient } from "@tanstack/react-query";
import { screen, userEvent, waitFor } from "@testing-library/react-native";
import { randomUUID } from "expo-crypto";
import * as Haptics from "expo-haptics";
import { getNetworkStateAsync } from "expo-network";
import type { ReactElement } from "react";
import { AskExtraSheet, PutInSheet, TakeOutSheet } from "@/features/requests";
import { apiFetch } from "@/lib/api";
import { keys } from "@/lib/query";
import { renderFlow } from "../../flow-render";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock("@/lib/sound", () => ({ playSound: jest.fn(), getSoundOn: jest.fn(async () => true) }));
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
jest.mock("@jarso/data/progress", () => ({ getProgress: jest.fn() }));
jest.mock("@jarso/data/goals", () => ({ getGoalView: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn() }));
jest.mock("@jarso/data/family", () => ({
  getFamilyContext: jest.fn(),
  findParentLabels: jest.fn(),
}));
jest.mock("@jarso/data/rules", () => ({ findChildRules: jest.fn() }));
jest.mock("@jarso/data/requests", () => ({
  getAvailability: jest.fn(),
  callCreateDeposit: jest.fn(),
  callCreateWithdrawal: jest.fn(),
  callCreateEmergency: jest.fn(),
}));
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: "success" },
}));

const deposit = callCreateDeposit as jest.Mock;
const withdraw = callCreateWithdrawal as jest.Mock;
const emergency = callCreateEmergency as jest.Mock;
const dispatch = apiFetch as jest.Mock;
const uuid = randomUUID as jest.Mock;

const KEY_1 = "11111111-1111-4111-8111-111111111111";
const KEY_2 = "22222222-2222-4222-8222-222222222222";
const CLIENT = { id: "client" };

async function open(ui: (onClose: () => void) => ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  const onClose = jest.fn();
  const view = await renderFlow(ui(onClose), client);
  return { onClose, ...view };
}

type User = ReturnType<typeof userEvent.setup>;

/** The celebration's title is on screen: the ask went. */
async function sent(title: string) {
  expect(await screen.findByText(title)).toBeOnTheScreen();
}

async function keys_(user: User, text: string) {
  await screen.findByRole("button", { name: "1" });
  for (const key of text) {
    await user.press(screen.getByRole("button", { name: key === "." ? "Point" : key }));
  }
}

const press = (user: User, name: string) => user.press(screen.getByRole("button", { name }));
const pick = async (user: User, name: string) =>
  user.press(await screen.findByRole("radio", { name }));

/** Keys the amount, Next, then the reason picture. */
async function ask(user: User, text: string, reason: string, button = "Ask Mum") {
  await keys_(user, text);
  await press(user, "Next");
  await pick(user, reason);
  await press(user, button);
}

beforeEach(() => {
  jest.clearAllMocks();
  uuid.mockReturnValue(KEY_1);
  dispatch.mockResolvedValue(undefined);
  (getNetworkStateAsync as jest.Mock).mockResolvedValue({ isConnected: false });
  (getJars as jest.Mock).mockResolvedValue({ spend: 1250, save: 4000 });
  (getAvailability as jest.Mock).mockResolvedValue({
    spendMinor: 1250,
    saveMinor: 4000,
    reservedSaveMinor: 0,
    heldSpendMinor: 0,
    availableSaveMinor: 4000,
    availableSpendMinor: 1000,
    takeOutLimitMinor: 1500,
  });
  (getProgress as jest.Mock).mockResolvedValue({ sparks: 0, streak: 0 });
  (findParentLabels as jest.Mock).mockResolvedValue(["Mum"]);
  (getGoalView as jest.Mock).mockResolvedValue(null);
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-02",
  });
  (findChildRules as jest.Mock).mockResolvedValue({
    allowNegativeSpend: false,
    jarMovesApproval: "ask",
    rules: [
      { kind: "withdrawal_cap", period: "week", amountMinor: 1500 },
      { kind: "withdrawal_auto_approve", period: "item", amountMinor: 500 },
      { kind: "deposit_auto_confirm", period: "item", amountMinor: 1000 },
      { kind: "spend_limit", period: "week", amountMinor: 2000 },
    ],
  });
});

const DEPOSIT_PENDING = { status: "pending", requestId: "r1" } as const;
const GOAL = {
  goal: { name: "Boots", emoji: "⚽", targetMinor: 10000, planMinor: 1000 },
  progress: { countedMinor: 2000, remainingMinor: 8000, reached: false },
};

describe("PutInSheet", () => {
  it("shows what Spend has as one chip", async () => {
    await open((onClose) => <PutInSheet onClose={onClose} />);
    expect(await screen.findByText("Spend has £10")).toBeOnTheScreen();
    expect(screen.queryByText(/goes straight into Save/)).toBeNull();
  });

  it("the jars update as you type", async () => {
    const user = userEvent.setup();
    await open((onClose) => <PutInSheet onClose={onClose} />);
    expect(await screen.findByLabelText("Spend £10")).toBeOnTheScreen();
    expect(screen.getByLabelText("Save £40")).toBeOnTheScreen();
    await keys_(user, "3");
    expect(screen.getByLabelText("Spend £7")).toBeOnTheScreen();
    expect(screen.getByLabelText("Save £43")).toBeOnTheScreen();
  });

  it("the button says I'll give £… to Mum", async () => {
    const user = userEvent.setup();
    await open((onClose) => <PutInSheet onClose={onClose} />);
    await keys_(user, "2.50");
    expect(screen.getByRole("button", { name: "I'll give £2.50 to Mum" })).toBeOnTheScreen();
  });

  it("shows Jarso's guess with an unreached goal and not without", async () => {
    (getGoalView as jest.Mock).mockResolvedValue(GOAL);
    const user = userEvent.setup();
    await open((onClose) => <PutInSheet onClose={onClose} />);
    await waitFor(() => expect(getGoalView).toHaveBeenCalled());
    await keys_(user, "5");
    expect(await screen.findByText(guessCopy.question("⚽"))).toBeOnTheScreen();
  });

  it("sends the amount in minor units with the opening's key, refreshes, dispatches", async () => {
    deposit.mockResolvedValue(DEPOSIT_PENDING);
    const user = userEvent.setup();
    const { client } = await open((onClose) => <PutInSheet onClose={onClose} />);
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await keys_(user, "2.50");
    await press(user, "I'll give £2.50 to Mum");
    await sent("Now give Mum £2.50");
    expect(deposit).toHaveBeenCalledWith(CLIENT, {
      childId: "child-1",
      amountMinor: 250,
      idempotencyKey: KEY_1,
    });
    for (const key of [keys.home, keys.requests, keys.history]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: key("child-1") });
    }
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
  });

  it("pending celebrates Now give Mum and offers Track it", async () => {
    deposit.mockResolvedValue(DEPOSIT_PENDING);
    const user = userEvent.setup();
    const { onClose } = await open((close) => <PutInSheet onClose={close} />);
    await keys_(user, "1");
    await press(user, "I'll give £1 to Mum");
    await sent("Now give Mum £1");
    expect(screen.getByText("Then it's in Save")).toBeOnTheScreen();
    await user.press(screen.getByText("Track it"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/(child)/requests"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("confirmed celebrates with no tracker", async () => {
    deposit.mockResolvedValue({ status: "confirmed", requestId: "r1" });
    const user = userEvent.setup();
    const { onClose } = await open((close) => <PutInSheet onClose={close} />);
    await keys_(user, "1");
    await press(user, "I'll give £1 to Mum");
    await sent(askCelebration("deposit", "confirmed", "£1", "Mum").title);
    expect(screen.queryByText("Track it")).toBeNull();
    await user.press(screen.getByText("Nice"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("over_available shows its message, keeps the sheet open, sends no notice", async () => {
    deposit.mockResolvedValue({ status: "over_available", availableMinor: 300 });
    const user = userEvent.setup();
    const { onClose } = await open((close) => <PutInSheet onClose={close} />);
    await keys_(user, "50");
    await press(user, "I'll give £50 to Mum");
    expect(
      await screen.findByText(
        depositMessage({ status: "over_available", availableMinor: 300 }, "GBP"),
      ),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Amount")).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it("rejects a bad amount without calling the server", async () => {
    const user = userEvent.setup();
    await open((close) => <PutInSheet onClose={close} />);
    await screen.findByRole("button", { name: "1" });
    await press(user, "Save some");
    expect(await screen.findByText(/amount/i)).toBeOnTheScreen();
    expect(deposit).not.toHaveBeenCalled();
  });

  it("reuses the key on a retry and makes a new one on the next opening", async () => {
    deposit
      .mockRejectedValueOnce(new AppError("UNAVAILABLE", "Jarso can't be reached right now."))
      .mockResolvedValue(DEPOSIT_PENDING);
    const user = userEvent.setup();
    const first = await open((close) => <PutInSheet onClose={close} />);
    await keys_(user, "2");
    await press(user, "I'll give £2 to Mum");
    expect(await screen.findByText(offlineCopy.offline)).toBeOnTheScreen();
    await press(user, "I'll give £2 to Mum");
    await sent("Now give Mum £2");
    expect(deposit.mock.calls.map((c) => c[1].idempotencyKey)).toEqual([KEY_1, KEY_1]);
    expect(uuid).toHaveBeenCalledTimes(1);
    await first.unmount();

    uuid.mockReturnValue(KEY_2);
    await open((close) => <PutInSheet onClose={close} />);
    await keys_(user, "2");
    await press(user, "I'll give £2 to Mum");
    await sent("Now give Mum £2");
    expect(deposit.mock.calls.map((c) => c[1].idempotencyKey)).toEqual([KEY_1, KEY_1, KEY_2]);
  });
});

describe("TakeOutSheet", () => {
  it("shows the take-out limit as one chip", async () => {
    await open((close) => <TakeOutSheet onClose={close} />);
    expect(await screen.findByText("You can ask up to £15")).toBeOnTheScreen();
    expect(screen.queryByText(/without asking/)).toBeNull();
  });

  it("sends the amount, the reason and the key", async () => {
    withdraw.mockResolvedValue({ status: "pending", requestId: "r1" });
    const user = userEvent.setup();
    await open((close) => <TakeOutSheet onClose={close} />);
    await ask(user, "4", "Games");
    await sent("Asked Mum!");
    expect(withdraw).toHaveBeenCalledWith(CLIENT, {
      childId: "child-1",
      amountMinor: 400,
      reason: "Games",
      idempotencyKey: KEY_1,
    });
  });

  it("My goal sends the goal's name", async () => {
    (getGoalView as jest.Mock).mockResolvedValue(GOAL);
    withdraw.mockResolvedValue({ status: "pending", requestId: "r1" });
    const user = userEvent.setup();
    await open((close) => <TakeOutSheet onClose={close} />);
    await waitFor(() => expect(getGoalView).toHaveBeenCalled());
    await keys_(user, "4");
    await press(user, "Next");
    await pick(user, "My goal");
    await press(user, "Ask Mum");
    await sent("Asked Mum!");
    expect(withdraw.mock.calls[0][1].reason).toBe("My goal: Boots");
  });

  it("Jarso's guess shows with a goal and not without", async () => {
    const user = userEvent.setup();
    (getGoalView as jest.Mock).mockResolvedValue(null);
    const none = await open((close) => <TakeOutSheet onClose={close} />);
    await keys_(user, "5");
    await waitFor(() => expect(getGoalView).toHaveBeenCalled());
    expect(screen.queryByText(guessCopy.question("⚽"))).toBeNull();
    await none.unmount();

    (getGoalView as jest.Mock).mockResolvedValue(GOAL);
    await open((close) => <TakeOutSheet onClose={close} />);
    await keys_(user, "5");
    expect(await screen.findByText(guessCopy.question("⚽"))).toBeOnTheScreen();
    await press(user, "Further");
    expect(screen.getByRole("button", { name: "Further" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true }),
    );
  });

  it.each([
    ["pending", "Asked Mum!"],
    ["approved", "Mum said yes!"],
    ["done", "£4 is yours"],
    ["already_sent", "Already sent to Mum"],
  ] as const)("%s celebrates", async (status, title) => {
    withdraw.mockResolvedValue({ status, requestId: "r1" });
    const user = userEvent.setup();
    await open((close) => <TakeOutSheet onClose={close} />);
    await ask(user, "4", "Games");
    await sent(title);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("approved celebrates Mum said yes", async () => {
    withdraw.mockResolvedValue({ status: "approved", requestId: "r1" });
    const user = userEvent.setup();
    await open((close) => <TakeOutSheet onClose={close} />);
    await ask(user, "4", "Games");
    await sent("Mum said yes!");
    expect(screen.getByText("Track it")).toBeOnTheScreen();
  });

  it("asks without a reason (it is optional)", async () => {
    withdraw.mockResolvedValue({ status: "done", requestId: "r1" });
    const user = userEvent.setup();
    await open((close) => <TakeOutSheet onClose={close} />);
    await ask(user, "1", "Other");
    await sent("£1 is yours");
    expect(withdraw.mock.calls[0][1].reason).toBe("");
  });

  it("sends what is typed under Other", async () => {
    withdraw.mockResolvedValue({ status: "pending", requestId: "r1" });
    const user = userEvent.setup();
    await open((close) => <TakeOutSheet onClose={close} />);
    await keys_(user, "4");
    await press(user, "Next");
    await pick(user, "Other");
    await user.type(screen.getByLabelText("What's it for?"), "a book");
    await press(user, "Ask Mum");
    await sent("Asked Mum!");
    expect(withdraw.mock.calls[0][1].reason).toBe("a book");
  });

  it("over_available shows the message on the amount and keeps the sheet open", async () => {
    const result = { status: "over_available", availableMinor: 900 } as const;
    withdraw.mockResolvedValue(result);
    const user = userEvent.setup();
    const { onClose } = await open((close) => <TakeOutSheet onClose={close} />);
    await ask(user, "50", "Games");
    expect(await screen.findByText(withdrawalMessage(result, "GBP"))).toBeOnTheScreen();
    expect(screen.getByLabelText("Amount")).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it("over_cap shows the cap message verbatim and keeps the sheet open", async () => {
    const result = { status: "over_cap", period: "week", capMinor: 1500, usedMinor: 1000 } as const;
    withdraw.mockResolvedValue(result);
    const user = userEvent.setup();
    const { onClose } = await open((close) => <TakeOutSheet onClose={close} />);
    await ask(user, "9", "Games");
    expect(await screen.findByText(overCapMessage("week", 1500, 1000, "GBP"))).toBeOnTheScreen();
    expect(screen.getByLabelText("Amount")).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("reuses the key after a refusal within one opening", async () => {
    withdraw
      .mockResolvedValueOnce({ status: "over_available", availableMinor: 100 })
      .mockResolvedValueOnce({ status: "pending", requestId: "r1" });
    const user = userEvent.setup();
    await open((close) => <TakeOutSheet onClose={close} />);
    await ask(user, "50", "Games");
    await screen.findByText("You can take out up to £1");
    await press(user, "Delete");
    await press(user, "Delete");
    await keys_(user, "1");
    await press(user, "Next");
    await press(user, "Ask Mum");
    await sent("Asked Mum!");
    expect(withdraw.mock.calls.map((c) => c[1].idempotencyKey)).toEqual([KEY_1, KEY_1]);
  });

  it("says slow, not offline, when the phone is online but Jarso did not answer", async () => {
    (getNetworkStateAsync as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
    withdraw.mockRejectedValue(new AppError("UNAVAILABLE", "x"));
    const user = userEvent.setup();
    await open((close) => <TakeOutSheet onClose={close} />);
    await ask(user, "1", "Games");
    expect(await screen.findByText(offlineCopy.slow)).toBeOnTheScreen();
  });
});

describe("AskExtraSheet", () => {
  it("needs a reason, with the web's message", async () => {
    const user = userEvent.setup();
    await open((close) => <AskExtraSheet onClose={close} />);
    await keys_(user, "5");
    await press(user, "Next");
    await pick(user, "Other");
    await press(user, "Ask Mum");
    expect(await screen.findByText("Say what it's for.")).toBeOnTheScreen();
    expect(screen.getByLabelText("What's it for?")).toHaveProp("aria-invalid", true);
    expect(emergency).not.toHaveBeenCalled();
  });

  it("a picked reason is sent as its label", async () => {
    emergency.mockResolvedValue({ status: "pending", requestId: "r1" });
    const user = userEvent.setup();
    const { client } = await open((close) => <AskExtraSheet onClose={close} />);
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await ask(user, "5", "School");
    await sent("Asked Mum!");
    expect(emergency).toHaveBeenCalledWith(CLIENT, {
      childId: "child-1",
      amountMinor: 500,
      reason: "School",
      idempotencyKey: KEY_1,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.requests("child-1") });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("already_sent says so, with no tracker", async () => {
    emergency.mockResolvedValue({ status: "already_sent", requestId: "r1" });
    const user = userEvent.setup();
    await open((close) => <AskExtraSheet onClose={close} />);
    await ask(user, "5", "School");
    await sent("Already sent to Mum");
    expect(screen.queryByText("Track it")).toBeNull();
  });

  it("reuses the key on a retry after a failed request", async () => {
    emergency
      .mockRejectedValueOnce(new AppError("UNAVAILABLE", "x"))
      .mockResolvedValueOnce({ status: "pending", requestId: "r1" });
    const user = userEvent.setup();
    await open((close) => <AskExtraSheet onClose={close} />);
    await ask(user, "5", "School");
    expect(await screen.findByText(offlineCopy.offline)).toBeOnTheScreen();
    expect(dispatch).not.toHaveBeenCalled();
    await press(user, "Ask Mum");
    await sent("Asked Mum!");
    expect(emergency.mock.calls.map((c) => c[1].idempotencyKey)).toEqual([KEY_1, KEY_1]);
  });
});
