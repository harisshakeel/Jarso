import { AppError } from "@jarso/core/lib";
import { askCard, askCardCopy, parentRequestCopy } from "@jarso/core/requests";
import {
  callCancel,
  callComplete,
  callDecideDeposit,
  callDecideWithdrawal,
} from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { type FamilyRequestItem, ParentRequestItems } from "@/features/requests";
import { flash } from "@/lib/flash";
import { dispatchNotices } from "@/lib/notices";
import { keys } from "@/lib/query";
import { files, read, relative, root } from "../../source-files";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/notices", () => ({ dispatchNotices: jest.fn() }));
jest.mock("@/lib/flash", () => ({ flash: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "55555555-5555-4555-8555-555555555555" }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
jest.mock("@jarso/data/requests", () => ({
  callDecideWithdrawal: jest.fn(),
  callComplete: jest.fn(),
  callDecideDeposit: jest.fn(),
  callCancel: jest.fn(),
}));

const decide = callDecideWithdrawal as jest.Mock;
const complete = callComplete as jest.Mock;
const KEY = "55555555-5555-4555-8555-555555555555";

const withdrawal: FamilyRequestItem = {
  childId: "child-1",
  nickname: "Sam",
  request: {
    id: "request-1",
    kind: "withdrawal",
    status: "pending",
    amountMinor: 500,
    reason: "For a book",
    auto: false,
    occurredAt: "2026-11-04T09:00:00Z",
  },
};
const deposit: FamilyRequestItem = {
  ...withdrawal,
  request: { ...withdrawal.request, kind: "deposit", reason: null },
};
const approved: FamilyRequestItem = {
  ...withdrawal,
  request: { ...withdrawal.request, status: "approved" },
};

async function renderItems(items: FamilyRequestItem[]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  const invalidate = jest.spyOn(client, "invalidateQueries");
  await render(
    <QueryClientProvider client={client}>
      <ParentRequestItems items={items} currency="GBP" />
    </QueryClientProvider>,
  );
  return { invalidate };
}

const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => jest.clearAllMocks());

describe("ParentRequestItems", () => {
  it("says each request on its own card", async () => {
    await renderItems([withdrawal, deposit]);
    const card = askCard(withdrawal.request, "Sam", "£5.00");
    expect(screen.getByText(card.title)).toBeOnTheScreen();
    expect(screen.getByText(new RegExp(card.line))).toBeOnTheScreen();
    expect(screen.getByText(askCard(deposit.request, "Sam", "£5.00").title)).toBeOnTheScreen();
  });

  it("Yes approves and flashes", async () => {
    decide.mockResolvedValue("approved");
    const { invalidate } = await renderItems([withdrawal]);
    await userEvent.setup().press(button(askCardCopy.yes));
    await waitFor(() =>
      expect(flash).toHaveBeenCalledWith(parentRequestCopy.approved("£5.00", "Sam")),
    );
    expect(decide).toHaveBeenCalledWith(
      { id: "client" },
      { requestId: "request-1", approve: true, note: "" },
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.child("child-1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.family("parent-1") });
    expect(dispatchNotices).toHaveBeenCalled();
  });

  it("Not now says no and flashes the web's line", async () => {
    decide.mockResolvedValue("rejected");
    await renderItems([withdrawal]);
    await userEvent.setup().press(button(askCardCopy.notNow));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(parentRequestCopy.rejected));
    expect(decide).toHaveBeenCalledWith(
      { id: "client" },
      { requestId: "request-1", approve: false, note: "" },
    );
  });

  it("already_decided flashes Already sorted", async () => {
    decide.mockResolvedValue("already_decided");
    await renderItems([withdrawal]);
    await userEvent.setup().press(button(askCardCopy.yes));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(parentRequestCopy.settled));
  });

  it("over_available shows the line on the card", async () => {
    decide.mockResolvedValue("over_available");
    await renderItems([withdrawal]);
    await userEvent.setup().press(button(askCardCopy.yes));
    expect(await screen.findByText(parentRequestCopy.overAvailable)).toBeOnTheScreen();
    expect(flash).not.toHaveBeenCalled();
  });

  it("a conflict shows the error and refetches the family", async () => {
    decide.mockRejectedValue(new AppError("CONFLICT", "This request changed."));
    const { invalidate } = await renderItems([withdrawal]);
    await userEvent.setup().press(button(askCardCopy.yes));
    expect(await screen.findByRole("alert")).toHaveTextContent("This request changed.");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.family("parent-1") });
  });

  it("Got it confirms a put-in with one key per row", async () => {
    complete.mockResolvedValue("completed");
    await renderItems([deposit]);
    await userEvent.setup().press(button(askCardCopy.gotIt));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(parentRequestCopy.depositDone));
    expect(complete).toHaveBeenCalledWith(
      { id: "client" },
      { requestId: "request-1", idempotencyKey: KEY },
    );
  });

  it("Not yet says no to a put-in", async () => {
    (callDecideDeposit as jest.Mock).mockResolvedValue("rejected");
    await renderItems([deposit]);
    await userEvent.setup().press(button(askCardCopy.notYet));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(parentRequestCopy.depositRejected));
    expect(callDecideDeposit).toHaveBeenCalledWith(
      { id: "client" },
      { requestId: "request-1", note: "" },
    );
  });

  it("Handed over confirms an approved take-out", async () => {
    complete.mockResolvedValue("completed");
    await renderItems([approved]);
    await userEvent.setup().press(button(askCardCopy.handedOver));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(parentRequestCopy.handedOver));
  });

  it("Didn't give it asks first", async () => {
    (callCancel as jest.Mock).mockResolvedValue("cancelled");
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await renderItems([approved]);
    await userEvent.setup().press(button(askCardCopy.didntGive));
    expect(callCancel).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      parentRequestCopy.didntHandOverTitle,
      parentRequestCopy.didntHandOverBody,
      expect.any(Array),
    );
    const actions = alert.mock.calls[0]?.[2] as { text: string; onPress?: () => void }[];
    await act(async () =>
      actions.find((a) => a.text === parentRequestCopy.didntHandOverConfirm)?.onPress?.(),
    );
    await waitFor(() => expect(flash).toHaveBeenCalledWith(parentRequestCopy.cancelled));
    expect(callCancel).toHaveBeenCalledWith({ id: "client" }, "request-1");
    alert.mockRestore();
  });

  it("two quick taps on Got it complete once", async () => {
    let finish: (value: string) => void = () => {};
    complete.mockReturnValue(
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    );
    await renderItems([deposit]);
    const user = userEvent.setup();
    await user.press(button(askCardCopy.gotIt));
    await user.press(button(askCardCopy.gotIt));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(button(askCardCopy.gotIt)).toBeDisabled();
    expect(button(askCardCopy.notYet)).toBeDisabled();
    await act(async () => finish("completed"));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(parentRequestCopy.depositDone));
  });

  it("a failed answer can be tried again with the same key", async () => {
    complete
      .mockRejectedValueOnce(new AppError("UNAVAILABLE", "You're offline."))
      .mockResolvedValueOnce("completed");
    await renderItems([deposit]);
    const user = userEvent.setup();
    await user.press(button(askCardCopy.gotIt));
    expect(await screen.findByRole("alert")).toBeOnTheScreen();
    await waitFor(() => expect(button(askCardCopy.gotIt)).toBeEnabled());
    await user.press(button(askCardCopy.gotIt));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(parentRequestCopy.depositDone));
    expect(complete).toHaveBeenCalledTimes(2);
    for (const call of complete.mock.calls) expect(call[1].idempotencyKey).toBe(KEY);
  });

  it("no sparks, confetti or sound on the parent side", () => {
    const parentFiles = [
      ...files(`${root}/src/features/parent`),
      ...files(`${root}/src/features/family`),
      ...[
        "requests/parent-request-items.tsx",
        "allowance/due-list.tsx",
        "allowance/handover-card.tsx",
        "allowance/handover-form.tsx",
      ].map((file) => `${root}/src/features/${file}`),
    ];
    for (const file of parentFiles) {
      const source = read(file);
      expect({
        file: relative(file),
        hit: /Confetti|useCelebrate|playSound|sparks/.test(source),
      }).toEqual({ file: relative(file), hit: false });
    }
  });
});
