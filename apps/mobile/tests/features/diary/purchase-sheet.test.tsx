import { notEnoughSpendMessage, purchaseSchema } from "@jarso/core/diary";
import { AppError } from "@jarso/core/lib";
import { offlineCopy } from "@jarso/core/offline";
import { undoEntry } from "@jarso/data/diary";
import { getFamilyContext } from "@jarso/data/family";
import { getJars } from "@jarso/data/ledger";
import { getProgress } from "@jarso/data/progress";
import { getAvailability } from "@jarso/data/requests";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import { randomUUID } from "expo-crypto";
import * as Haptics from "expo-haptics";
import { getNetworkStateAsync } from "expo-network";
import { PurchaseSheet } from "@/features/diary";
import { apiFetch } from "@/lib/api";
import { removeItem, submit } from "@/lib/outbox";
import { keys } from "@/lib/query";
import { renderFlow } from "../../flow-render";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/diary", () => ({ undoEntry: jest.fn() }));
jest.mock("@/lib/outbox", () => ({
  submit: jest.fn(),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn() }));
jest.mock("@jarso/data/progress", () => ({ getProgress: jest.fn() }));
jest.mock("@/lib/sound", () => ({ playSound: jest.fn(), getSoundOn: jest.fn(async () => true) }));
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
jest.mock("@jarso/data/requests", () => ({ getAvailability: jest.fn() }));
jest.mock("@jarso/data/family", () => ({ getFamilyContext: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn() }));
jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: "success" },
}));

const record = submit as jest.Mock;
const sent = (entryId: string) => ({ status: "sent", data: { status: "recorded", entryId } });
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
  return { onClose, ...(await renderFlow(<PurchaseSheet onClose={onClose} />, client)) };
}

type User = ReturnType<typeof userEvent.setup>;

async function typeAmount(user: User, amount: string) {
  await screen.findByRole("button", { name: "Next" });
  for (const key of amount) {
    await user.press(screen.getByRole("button", { name: key === "." ? "Point" : key }));
  }
}

/** Keys the amount, Next, then the Snacks picture. */
async function fill(user: User, amount: string) {
  await typeAmount(user, amount);
  await user.press(screen.getByRole("button", { name: "Next" }));
  await user.press(await screen.findByRole("radio", { name: "Snacks" }));
}

const press = (user: User, name: string) => user.press(screen.getByRole("button", { name }));
const DONE = "Done · £2.50 snacks";

beforeEach(() => {
  jest.clearAllMocks();
  uuid.mockReturnValue(KEY_1);
  dispatch.mockResolvedValue(undefined);
  (getNetworkStateAsync as jest.Mock).mockResolvedValue({ isConnected: false });
  (getJars as jest.Mock).mockResolvedValue({ spend: 1250, save: 4000 });
  (getAvailability as jest.Mock).mockResolvedValue({ availableSpendMinor: 1250 });
  (getProgress as jest.Mock).mockResolvedValue({ sparks: 10, streak: 1 });
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-02",
  });
});

describe("PurchaseSheet", () => {
  it("takes the amount on the keypad and sends what the web posts", async () => {
    record.mockResolvedValue(sent("e1"));
    const user = userEvent.setup();
    await renderSheet();
    await fill(user, "2.50");
    await press(user, DONE);
    await waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    // Through the outbox, with exactly what the web form posts.
    expect(record).toHaveBeenCalledWith({
      userId: "child-1",
      kind: "purchase",
      payload: { amount: "2.50", category: "snacks", label: "", idempotencyKey: KEY_1 },
      idempotencyKey: KEY_1,
    });
  });

  it("shows what Spend has as a chip", async () => {
    await renderSheet();
    expect(await screen.findByText("Spend has £12.50")).toBeOnTheScreen();
  });

  it("a quick chip fills the amount", async () => {
    const user = userEvent.setup();
    await renderSheet();
    await user.press(await screen.findByRole("button", { name: "£5" }));
    expect(screen.getByLabelText("Amount")).toHaveProp("accessibilityValue", { text: "£5" });
  });

  it("Next needs an amount and sends nothing", async () => {
    const user = userEvent.setup();
    await renderSheet();
    await user.press(await screen.findByRole("button", { name: "Next" }));
    const message = purchaseSchema("GBP").safeParse({
      amount: "",
      category: "other",
      idempotencyKey: KEY_1,
    });
    const expected = message.success ? "" : message.error.issues[0]?.message;
    expect(expected).toBeTruthy();
    expect(await screen.findByText(expected as string)).toBeOnTheScreen();
    expect(screen.queryByText("On what?")).toBeNull();
    expect(record).not.toHaveBeenCalled();
  });

  it("the button repeats the choice and waits for a pick", async () => {
    const user = userEvent.setup();
    await renderSheet();
    await typeAmount(user, "2.50");
    await press(user, "Next");
    expect(await screen.findByRole("button", { name: "Done · £2.50" })).toBeDisabled();
    await user.press(screen.getByRole("radio", { name: "Snacks" }));
    expect(screen.getByRole("button", { name: DONE })).toBeEnabled();
    await user.press(screen.getByRole("radio", { name: "Games" }));
    expect(screen.getByRole("button", { name: "Done · £2.50 games" })).toBeOnTheScreen();
  });

  it("shows the server's refusal verbatim, drops it from the outbox and keeps the step", async () => {
    record.mockResolvedValue({ status: "refused", message: notEnoughSpendMessage(300, "GBP") });
    const user = userEvent.setup();
    const { onClose } = await renderSheet();
    await fill(user, "9");
    await press(user, "Done · £9 snacks");
    expect(await screen.findByText(notEnoughSpendMessage(300, "GBP"))).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Snacks" })).toBeOnTheScreen();
    expect(screen.queryByText("Written down!")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(removeItem).toHaveBeenCalledWith(KEY_1);
  });

  it("queued: says it waits on the phone, no dispatch, no celebration", async () => {
    record.mockResolvedValue({ status: "queued" });
    const user = userEvent.setup();
    const { onClose } = await renderSheet();
    await fill(user, "2.50");
    await press(user, DONE);
    expect(await screen.findByText(offlineCopy.waiting)).toBeOnTheScreen();
    expect(screen.queryByText("Written down!")).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
    await user.press(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it.each([
    ["unsaved", offlineCopy.offline],
    ["unsent", offlineCopy.slow],
  ])("%s: shows core's wording and keeps the choice", async (status, line) => {
    record.mockResolvedValue({ status });
    const user = userEvent.setup();
    await renderSheet();
    await fill(user, "2.50");
    await press(user, DONE);
    expect(await screen.findByText(line)).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Snacks" })).toBeChecked();
    await user.press(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Amount")).toHaveProp("accessibilityValue", { text: "£2.50" });
  });

  it("changing a purchase that needs a look prefills it and replaces it once stored", async () => {
    record.mockResolvedValue({ status: "queued" });
    const user = userEvent.setup();
    await renderFlow(
      <PurchaseSheet
        onClose={jest.fn()}
        initial={{ amount: "9", label: "Comic", category: "snacks" }}
        replaces="old-id"
      />,
    );
    expect(await screen.findByLabelText("Amount")).toHaveProp("accessibilityValue", { text: "£9" });
    await press(user, "Next");
    expect(await screen.findByLabelText("Name it")).toHaveProp("value", "Comic");
    await press(user, "Done · £9 snacks");
    await screen.findByText(offlineCopy.waiting);
    expect(record.mock.calls[0][0].payload).toEqual({
      amount: "9",
      category: "snacks",
      label: "Comic",
      idempotencyKey: KEY_1,
    });
    expect(removeItem).toHaveBeenCalledWith("old-id");
  });

  it("reuses the idempotency key on a retry after a failed send", async () => {
    record.mockResolvedValueOnce({ status: "unsaved" }).mockResolvedValueOnce(sent("e1"));
    const user = userEvent.setup();
    await renderSheet();
    await fill(user, "2.50");
    await press(user, DONE);
    expect(await screen.findByText(offlineCopy.offline)).toBeOnTheScreen();
    expect(dispatch).not.toHaveBeenCalled();
    await press(user, DONE);
    await screen.findByText("Written down!");
    const keysSent = record.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keysSent).toEqual([KEY_1, KEY_1]);
    expect(uuid).toHaveBeenCalledTimes(1);
  });

  it("makes a new idempotency key when the sheet is opened again", async () => {
    record.mockResolvedValue(sent("e1"));
    const user = userEvent.setup();
    const first = await renderSheet();
    await fill(user, "1");
    await press(user, "Done · £1 snacks");
    await screen.findByText("Written down!");
    await first.unmount();

    uuid.mockReturnValue(KEY_2);
    await renderSheet();
    await fill(user, "1");
    await press(user, "Done · £1 snacks");
    await waitFor(() => expect(record).toHaveBeenCalledTimes(2));
    expect(record.mock.calls.map((c) => c[0].idempotencyKey)).toEqual([KEY_1, KEY_2]);
  });

  it("on success: celebrates Written down with +10 and Undo, refreshes, one dispatch, haptic", async () => {
    record.mockResolvedValue(sent("entry-9"));
    const user = userEvent.setup();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
    });
    client.setQueryData(keys.progress("child-1"), { sparks: 0, streak: 1 });
    await renderSheet(client);
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await fill(user, "2.50");
    await press(user, DONE);
    expect(await screen.findByText("Written down!")).toBeOnTheScreen();
    expect(screen.getByText("£2.50 · Snacks")).toBeOnTheScreen();
    expect(await screen.findByText("+10")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Undo" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Nice" })).toBeOnTheScreen();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith("/api/v1/notices/dispatch", {
      method: "POST",
      auth: true,
    });
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.home("child-1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.history("child-1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.progress("child-1") });
  });

  it("Nice leaves the sheet", async () => {
    record.mockResolvedValue(sent("entry-9"));
    const user = userEvent.setup();
    const { onClose } = await renderSheet();
    await fill(user, "2.50");
    await press(user, DONE);
    await user.press(await screen.findByRole("button", { name: "Nice" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("undo calls undoEntry with the returned entry id and refreshes", async () => {
    record.mockResolvedValue(sent("entry-9"));
    undo.mockResolvedValue("undone");
    const user = userEvent.setup();
    const { client } = await renderSheet();
    await fill(user, "2.50");
    await press(user, DONE);
    await screen.findByText("Written down!");
    const invalidate = jest.spyOn(client, "invalidateQueries");
    await user.press(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Undone. The money is back in Spend.")).toBeOnTheScreen();
    expect(undo).toHaveBeenCalledWith({ id: "client" }, "entry-9");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.home("child-1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.history("child-1") });
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("shows a busy Done while the undo is running", async () => {
    record.mockResolvedValue(sent("entry-9"));
    let finish: (value: unknown) => void = () => undefined;
    undo.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    await renderSheet();
    await fill(user, "2.50");
    await press(user, DONE);
    await screen.findByText("Written down!");
    await user.press(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("button", { name: "Done", busy: true })).toBeDisabled();
    finish("undone");
    expect(await screen.findByText("Undone. The money is back in Spend.")).toBeOnTheScreen();
  });

  it("shows the calm message when undo is refused", async () => {
    record.mockResolvedValue(sent("entry-9"));
    undo.mockRejectedValue(new AppError("CONFLICT", "You can only undo within a day."));
    const user = userEvent.setup();
    await renderSheet();
    await fill(user, "2.50");
    await press(user, DONE);
    await screen.findByText("Written down!");
    await user.press(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("You can only undo within a day.")).toBeOnTheScreen();
  });

  it("keeps an Undo retry after a refused undo, and it can succeed", async () => {
    record.mockResolvedValue(sent("entry-9"));
    undo.mockResolvedValueOnce("not_enough_spend").mockResolvedValueOnce("undone");
    const user = userEvent.setup();
    await renderSheet();
    await fill(user, "2.50");
    await press(user, DONE);
    await screen.findByText("Written down!");
    await user.press(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("alert")).toBeOnTheScreen();
    await user.press(await screen.findByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Undone. The money is back in Spend.")).toBeOnTheScreen();
    expect(undo).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("does not fail the purchase when the notice dispatch fails", async () => {
    record.mockResolvedValue(sent("e1"));
    dispatch.mockRejectedValue(new AppError("UNAVAILABLE", "offline"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const user = userEvent.setup();
    await renderSheet();
    await fill(user, "2.50");
    await press(user, DONE);
    expect(await screen.findByText("Written down!")).toBeOnTheScreen();
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
    const button = screen.getByRole("button", { name: DONE });
    // Both presses start before React re-renders, which is what overlaps act() calls.
    const quiet = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await Promise.all([fireEvent.press(button), fireEvent.press(button)]);
    quiet.mockRestore();
    expect(record).toHaveBeenCalledTimes(1);
    finish(sent("e1"));
    await screen.findByText("Written down!");
  });
});
