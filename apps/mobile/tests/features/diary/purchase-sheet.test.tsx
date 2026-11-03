import { notEnoughSpendMessage } from "@jarso/core/diary";
import { AppError } from "@jarso/core/lib";
import { offlineCopy } from "@jarso/core/offline";
import { callRecordPurchase, undoEntry } from "@jarso/data/diary";
import { getFamilyContext } from "@jarso/data/family";
import { getJars } from "@jarso/data/ledger";
import { getAvailability } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { randomUUID } from "expo-crypto";
import * as Haptics from "expo-haptics";
import { getNetworkStateAsync } from "expo-network";
import { PurchaseSheet } from "@/features/diary";
import { apiFetch } from "@/lib/api";
import { keys } from "@/lib/query";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/diary", () => ({ callRecordPurchase: jest.fn(), undoEntry: jest.fn() }));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn() }));
jest.mock("@jarso/data/requests", () => ({ getAvailability: jest.fn() }));
jest.mock("@jarso/data/family", () => ({ getFamilyContext: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn() }));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: "success" },
}));

const record = callRecordPurchase as jest.Mock;
const undo = undoEntry as jest.Mock;
const dispatch = apiFetch as jest.Mock;
const uuid = randomUUID as jest.Mock;

const KEY_1 = "11111111-1111-4111-8111-111111111111";
const KEY_2 = "22222222-2222-4222-8222-222222222222";

async function renderSheet(
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  }),
) {
  const onClose = jest.fn();
  const ui = (
    <QueryClientProvider client={client}>
      <PurchaseSheet onClose={onClose} />
    </QueryClientProvider>
  );
  return { client, onClose, ...(await render(ui)) };
}

async function fill(user: ReturnType<typeof userEvent.setup>, amount: string) {
  await user.type(await screen.findByLabelText("Amount"), amount);
  await user.press(screen.getByRole("radio", { name: "Snacks" }));
}

beforeEach(() => {
  jest.clearAllMocks();
  uuid.mockReturnValue(KEY_1);
  dispatch.mockResolvedValue(undefined);
  (getNetworkStateAsync as jest.Mock).mockResolvedValue({ isConnected: false });
  (getJars as jest.Mock).mockResolvedValue({ spend: 1250, save: 4000 });
  (getAvailability as jest.Mock).mockResolvedValue({});
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-02",
  });
});

describe("PurchaseSheet", () => {
  it("takes the amount on the number pad and parses it like the web", async () => {
    record.mockResolvedValue({ status: "recorded", entryId: "e1" });
    const user = userEvent.setup();
    await renderSheet();
    const amount = await screen.findByLabelText("Amount");
    expect(amount.props.keyboardType).toBe("decimal-pad");
    await fill(user, "2.50");
    await user.press(screen.getByRole("button", { name: "Write it down" }));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(record).toHaveBeenCalledWith(
      { id: "client" },
      {
        childId: "child-1",
        amountMinor: 250,
        category: "snacks",
        label: "",
        idempotencyKey: KEY_1,
      },
    );
  });

  it("shows the web's field error for a bad amount and sends nothing", async () => {
    const user = userEvent.setup();
    await renderSheet();
    await fill(user, "abc");
    await user.press(screen.getByRole("button", { name: "Write it down" }));
    expect(await screen.findByLabelText("Amount")).toHaveProp("aria-invalid", true);
    expect(record).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Write it down")).toBeOnTheScreen();
  });

  it("waits for a category before it can be sent", async () => {
    await renderSheet();
    await screen.findByLabelText("Amount");
    expect(screen.getByText("Pick what it was for")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Write it down" })).toBeDisabled();
  });

  it("shows not_enough_spend verbatim and keeps the sheet open", async () => {
    record.mockResolvedValue({ status: "not_enough_spend", freeMinor: 300 });
    const user = userEvent.setup();
    const { onClose } = await renderSheet();
    await fill(user, "9");
    await user.press(screen.getByRole("button", { name: "Write it down" }));
    expect(await screen.findByText(notEnoughSpendMessage(300, "GBP"))).toBeOnTheScreen();
    expect(screen.getByLabelText("Amount")).toBeOnTheScreen();
    expect(screen.queryByText("Saved. Nice one.")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it("reuses the idempotency key on a retry after a failed request", async () => {
    record
      .mockRejectedValueOnce(new AppError("UNAVAILABLE", "Jarso can't be reached right now."))
      .mockResolvedValueOnce({ status: "recorded", entryId: "e1" });
    const user = userEvent.setup();
    await renderSheet();
    await fill(user, "2.50");
    await user.press(screen.getByRole("button", { name: "Write it down" }));
    expect(await screen.findByText(offlineCopy.offline)).toBeOnTheScreen();
    expect(dispatch).not.toHaveBeenCalled();
    await user.press(screen.getByRole("button", { name: "Write it down" }));
    await screen.findByText("Saved. Nice one.");
    const keysSent = record.mock.calls.map((c) => c[1].idempotencyKey);
    expect(keysSent).toEqual([KEY_1, KEY_1]);
    expect(uuid).toHaveBeenCalledTimes(1);
  });

  it("makes a new idempotency key when the sheet is opened again", async () => {
    record.mockResolvedValue({ status: "recorded", entryId: "e1" });
    const user = userEvent.setup();
    const first = await renderSheet();
    await fill(user, "1");
    await user.press(screen.getByRole("button", { name: "Write it down" }));
    await screen.findByText("Saved. Nice one.");
    await first.unmount();

    uuid.mockReturnValue(KEY_2);
    await renderSheet();
    await fill(user, "1");
    await user.press(screen.getByRole("button", { name: "Write it down" }));
    await waitFor(() => expect(record).toHaveBeenCalledTimes(2));
    expect(record.mock.calls.map((c) => c[1].idempotencyKey)).toEqual([KEY_1, KEY_2]);
  });

  it("on success: undo action, refresh, one dispatch, haptic", async () => {
    record.mockResolvedValue({ status: "recorded", entryId: "entry-9" });
    const user = userEvent.setup();
    const { client } = await renderSheet();
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await fill(user, "2.50");
    await user.press(screen.getByRole("button", { name: "Write it down" }));
    expect(await screen.findByText("Saved. Nice one.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Undo" })).toBeOnTheScreen();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith("/api/v1/notices/dispatch", {
      method: "POST",
      auth: true,
    });
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.home("child-1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.history("child-1") });
  });

  it("undo calls undoEntry with the returned entry id and refreshes", async () => {
    record.mockResolvedValue({ status: "recorded", entryId: "entry-9" });
    undo.mockResolvedValue("undone");
    const user = userEvent.setup();
    const { client } = await renderSheet();
    await fill(user, "2.50");
    await user.press(screen.getByRole("button", { name: "Write it down" }));
    await screen.findByText("Saved. Nice one.");
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await user.press(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Undone. The money is back in Spend.")).toBeOnTheScreen();
    expect(undo).toHaveBeenCalledWith({ id: "client" }, "entry-9");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.home("child-1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.history("child-1") });
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("shows the calm message when undo is refused", async () => {
    record.mockResolvedValue({ status: "recorded", entryId: "entry-9" });
    undo.mockRejectedValue(new AppError("CONFLICT", "You can only undo within a day."));
    const user = userEvent.setup();
    await renderSheet();
    await fill(user, "2.50");
    await user.press(screen.getByRole("button", { name: "Write it down" }));
    await screen.findByText("Saved. Nice one.");
    await user.press(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("You can only undo within a day.")).toBeOnTheScreen();
  });

  it("does not fail the purchase when the notice dispatch fails", async () => {
    record.mockResolvedValue({ status: "recorded", entryId: "e1" });
    dispatch.mockRejectedValue(new AppError("UNAVAILABLE", "offline"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const user = userEvent.setup();
    await renderSheet();
    await fill(user, "2.50");
    await user.press(screen.getByRole("button", { name: "Write it down" }));
    expect(await screen.findByText("Saved. Nice one.")).toBeOnTheScreen();
    expect(screen.queryByText("offline")).toBeNull();
    await waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });

  it("sends once when the button is pressed twice in the same frame", async () => {
    let finish: (value: unknown) => void = () => undefined;
    record.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    await renderSheet();
    await fill(user, "2.50");
    const button = screen.getByRole("button", { name: "Write it down" });
    // Both presses start before React re-renders, which is what overlaps act() calls.
    const quiet = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await Promise.all([fireEvent.press(button), fireEvent.press(button)]);
    quiet.mockRestore();
    expect(record).toHaveBeenCalledTimes(1);
    finish({ status: "recorded", entryId: "e1" });
    await screen.findByText("Saved. Nice one.");
  });
});
