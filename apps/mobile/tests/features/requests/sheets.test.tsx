import { AppError } from "@jarso/core/lib";
import { offlineCopy } from "@jarso/core/offline";
import {
  depositMessage,
  emergencyMessage,
  overCapMessage,
  withdrawalMessage,
} from "@jarso/core/requests";
import { getFamilyContext } from "@jarso/data/family";
import { getJars } from "@jarso/data/ledger";
import {
  callCreateDeposit,
  callCreateEmergency,
  callCreateWithdrawal,
  getAvailability,
} from "@jarso/data/requests";
import { findChildRules } from "@jarso/data/rules";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent } from "@testing-library/react-native";
import { randomUUID } from "expo-crypto";
import * as Haptics from "expo-haptics";
import { getNetworkStateAsync } from "expo-network";
import type { ReactElement } from "react";
import { AskExtraSheet, PutInSheet, TakeOutSheet } from "@/features/requests";
import { apiFetch } from "@/lib/api";
import { keys } from "@/lib/query";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn() }));
jest.mock("@jarso/data/family", () => ({ getFamilyContext: jest.fn() }));
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
  const view = await render(
    <QueryClientProvider client={client}>{ui(onClose)}</QueryClientProvider>,
  );
  return { client, onClose, ...view };
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

async function amount(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(await screen.findByLabelText("Amount"), text);
}

describe("PutInSheet", () => {
  it("shows what Spend has and the deposit rule lines", async () => {
    await open((onClose) => <PutInSheet onClose={onClose} />);
    expect(await screen.findByText("Spend has £10")).toBeOnTheScreen();
    expect(
      await screen.findByText("Money you put in up to £10 each time goes straight into Save"),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/take out/)).toBeNull();
  });

  it("sends the amount in minor units with the opening's key, refreshes, dispatches", async () => {
    deposit.mockResolvedValue({ status: "pending", requestId: "r1" });
    const user = userEvent.setup();
    const { client } = await open((onClose) => <PutInSheet onClose={onClose} />);
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await amount(user, "2.50");
    await user.press(screen.getByRole("button", { name: "Put in" }));
    expect(
      await screen.findByText(depositMessage({ status: "pending", requestId: "r1" }, "GBP")),
    ).toBeOnTheScreen();
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

  it.each(["pending", "confirmed", "done", "already_sent"] as const)(
    "shows the %s message verbatim and offers Done",
    async (status) => {
      deposit.mockResolvedValue({ status, requestId: "r1" });
      const user = userEvent.setup();
      const { onClose } = await open((close) => <PutInSheet onClose={close} />);
      await amount(user, "1");
      await user.press(screen.getByRole("button", { name: "Put in" }));
      expect(
        await screen.findByText(depositMessage({ status, requestId: "r1" }, "GBP")),
      ).toBeOnTheScreen();
      await user.press(screen.getByRole("button", { name: "Done" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    },
  );

  it("over_available shows its message, keeps the sheet open, sends no notice", async () => {
    deposit.mockResolvedValue({ status: "over_available", availableMinor: 300 });
    const user = userEvent.setup();
    const { onClose } = await open((close) => <PutInSheet onClose={close} />);
    await amount(user, "50");
    await user.press(screen.getByRole("button", { name: "Put in" }));
    expect(
      await screen.findByText(
        depositMessage({ status: "over_available", availableMinor: 300 }, "GBP"),
      ),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Amount")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it("rejects a bad amount without calling the server", async () => {
    const user = userEvent.setup();
    await open((close) => <PutInSheet onClose={close} />);
    await amount(user, "abc");
    await user.press(screen.getByRole("button", { name: "Put in" }));
    expect(await screen.findByLabelText("Amount")).toHaveProp("aria-invalid", true);
    expect(deposit).not.toHaveBeenCalled();
  });

  it("reuses the key on a retry and makes a new one on the next opening", async () => {
    deposit
      .mockRejectedValueOnce(new AppError("UNAVAILABLE", "Jarso can't be reached right now."))
      .mockResolvedValue({ status: "pending", requestId: "r1" });
    const user = userEvent.setup();
    const first = await open((close) => <PutInSheet onClose={close} />);
    await amount(user, "2");
    await user.press(screen.getByRole("button", { name: "Put in" }));
    expect(await screen.findByText(offlineCopy.offline)).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: "Put in" }));
    await screen.findByText("Waiting for your parent to confirm");
    expect(deposit.mock.calls.map((c) => c[1].idempotencyKey)).toEqual([KEY_1, KEY_1]);
    expect(uuid).toHaveBeenCalledTimes(1);
    await first.unmount();

    uuid.mockReturnValue(KEY_2);
    await open((close) => <PutInSheet onClose={close} />);
    await amount(user, "2");
    await user.press(screen.getByRole("button", { name: "Put in" }));
    await screen.findByText("Waiting for your parent to confirm");
    expect(deposit.mock.calls.map((c) => c[1].idempotencyKey)).toEqual([KEY_1, KEY_1, KEY_2]);
  });
});

describe("TakeOutSheet", () => {
  it("shows the take-out limit and the cap and auto-approve rule lines", async () => {
    await open((close) => <TakeOutSheet onClose={close} />);
    expect(await screen.findByText("You can take out up to £15")).toBeOnTheScreen();
    expect(await screen.findByText("You can take out at most £15 a week")).toBeOnTheScreen();
    expect(
      screen.getByText("You can take out up to £5 each time without asking"),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/goes straight into Save/)).toBeNull();
  });

  it("shows the move-without-asking line when the parent allows it", async () => {
    (findChildRules as jest.Mock).mockResolvedValue({
      allowNegativeSpend: false,
      jarMovesApproval: "notify",
      rules: [],
    });
    await open((close) => <TakeOutSheet onClose={close} />);
    expect(
      await screen.findByText(
        "You can move money between your jars without asking. Your parent gets a note.",
      ),
    ).toBeOnTheScreen();
  });

  it("sends the amount, the reason and the key", async () => {
    withdraw.mockResolvedValue({ status: "pending", requestId: "r1" });
    const user = userEvent.setup();
    await open((close) => <TakeOutSheet onClose={close} />);
    await amount(user, "4");
    await user.type(screen.getByLabelText("What's it for?"), "a book");
    await user.press(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("Sent to your parent");
    expect(withdraw).toHaveBeenCalledWith(CLIENT, {
      childId: "child-1",
      amountMinor: 400,
      reason: "a book",
      idempotencyKey: KEY_1,
    });
  });

  it.each(["pending", "approved", "done", "already_sent"] as const)(
    "shows the %s message verbatim",
    async (status) => {
      withdraw.mockResolvedValue({ status, requestId: "r1" });
      const user = userEvent.setup();
      await open((close) => <TakeOutSheet onClose={close} />);
      await amount(user, "4");
      await user.press(screen.getByRole("button", { name: "Ask" }));
      expect(
        await screen.findByText(withdrawalMessage({ status, requestId: "r1" }, "GBP")),
      ).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: "Done" })).toBeOnTheScreen();
      expect(dispatch).toHaveBeenCalledTimes(1);
    },
  );

  it("asks without a reason (it is optional)", async () => {
    withdraw.mockResolvedValue({ status: "done", requestId: "r1" });
    const user = userEvent.setup();
    await open((close) => <TakeOutSheet onClose={close} />);
    await amount(user, "1");
    await user.press(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("Done. Your parent knows.");
    expect(withdraw.mock.calls[0][1].reason).toBe("");
  });

  it("over_available keeps the sheet open", async () => {
    const result = { status: "over_available", availableMinor: 900 } as const;
    withdraw.mockResolvedValue(result);
    const user = userEvent.setup();
    const { onClose } = await open((close) => <TakeOutSheet onClose={close} />);
    await amount(user, "50");
    await user.press(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText(withdrawalMessage(result, "GBP"))).toBeOnTheScreen();
    expect(screen.getByLabelText("Amount")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it("over_cap shows the cap message verbatim and keeps the sheet open", async () => {
    const result = { status: "over_cap", period: "week", capMinor: 1500, usedMinor: 1000 } as const;
    withdraw.mockResolvedValue(result);
    const user = userEvent.setup();
    const { onClose } = await open((close) => <TakeOutSheet onClose={close} />);
    await amount(user, "9");
    await user.press(screen.getByRole("button", { name: "Ask" }));
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
    await amount(user, "50");
    await user.press(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("You can take out up to £1");
    await user.clear(screen.getByLabelText("Amount"));
    await user.type(screen.getByLabelText("Amount"), "1");
    await user.press(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("Sent to your parent");
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
    await amount(user, "1");
    await user.press(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText(offlineCopy.slow)).toBeOnTheScreen();
  });
});

describe("AskExtraSheet", () => {
  it("needs a reason, with the web's message", async () => {
    const user = userEvent.setup();
    await open((close) => <AskExtraSheet onClose={close} />);
    await amount(user, "5");
    await user.press(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("Say what it's for.")).toBeOnTheScreen();
    expect(screen.getByLabelText("What's it for?")).toHaveProp("aria-invalid", true);
    expect(emergency).not.toHaveBeenCalled();
  });

  it.each(["pending", "already_sent"] as const)("shows the %s message verbatim", async (status) => {
    emergency.mockResolvedValue({ status, requestId: "r1" });
    const user = userEvent.setup();
    const { client } = await open((close) => <AskExtraSheet onClose={close} />);
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await amount(user, "5");
    await user.type(screen.getByLabelText("What's it for?"), "school trip");
    await user.press(screen.getByRole("button", { name: "Ask" }));
    expect(
      await screen.findByText(emergencyMessage({ status, requestId: "r1" }, "GBP")),
    ).toBeOnTheScreen();
    expect(emergency).toHaveBeenCalledWith(CLIENT, {
      childId: "child-1",
      amountMinor: 500,
      reason: "school trip",
      idempotencyKey: KEY_1,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.requests("child-1") });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("reuses the key on a retry after a failed request", async () => {
    emergency
      .mockRejectedValueOnce(new AppError("UNAVAILABLE", "x"))
      .mockResolvedValueOnce({ status: "pending", requestId: "r1" });
    const user = userEvent.setup();
    await open((close) => <AskExtraSheet onClose={close} />);
    await amount(user, "5");
    await user.type(screen.getByLabelText("What's it for?"), "trip");
    await user.press(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText(offlineCopy.offline)).toBeOnTheScreen();
    expect(dispatch).not.toHaveBeenCalled();
    await user.press(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("Sent to your parent");
    expect(emergency.mock.calls.map((c) => c[1].idempotencyKey)).toEqual([KEY_1, KEY_1]);
  });
});
