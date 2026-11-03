import { AppError } from "@jarso/core/lib";
import { parentRequestCopy, requestSentence } from "@jarso/core/requests";
import { callComplete, callDecideDeposit, callDecideWithdrawal } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { type FamilyRequestItem, ParentRequestItems } from "@/features/requests";
import { flash } from "@/lib/flash";
import { dispatchNotices } from "@/lib/notices";
import { keys } from "@/lib/query";

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

beforeEach(() => jest.clearAllMocks());

describe("ParentRequestItems", () => {
  it("says each request in the web's sentence", async () => {
    await renderItems([withdrawal]);
    expect(screen.getByText(requestSentence(withdrawal.request, "Sam", "£5.00"))).toBeOnTheScreen();
  });

  it("approve calls decide and flashes", async () => {
    decide.mockResolvedValue("approved");
    const { invalidate } = await renderItems([withdrawal]);
    await userEvent.setup().press(screen.getByRole("button", { name: parentRequestCopy.approve }));
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

  it("not now rejects and flashes the web's line", async () => {
    decide.mockResolvedValue("rejected");
    await renderItems([withdrawal]);
    await userEvent.setup().press(screen.getByRole("button", { name: parentRequestCopy.notNow }));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(parentRequestCopy.rejected));
    expect(decide).toHaveBeenCalledWith(
      { id: "client" },
      { requestId: "request-1", approve: false, note: "" },
    );
  });

  it("already_decided flashes Already sorted", async () => {
    decide.mockResolvedValue("already_decided");
    await renderItems([withdrawal]);
    await userEvent.setup().press(screen.getByRole("button", { name: parentRequestCopy.approve }));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(parentRequestCopy.settled));
  });

  it("over_available shows the line on the row", async () => {
    decide.mockResolvedValue("over_available");
    await renderItems([withdrawal]);
    await userEvent.setup().press(screen.getByRole("button", { name: parentRequestCopy.approve }));
    expect(await screen.findByText(parentRequestCopy.overAvailable)).toBeOnTheScreen();
    expect(flash).not.toHaveBeenCalled();
  });

  it("a conflict shows the error and refetches the family", async () => {
    decide.mockRejectedValue(new AppError("CONFLICT", "This request changed."));
    const { invalidate } = await renderItems([withdrawal]);
    await userEvent.setup().press(screen.getByRole("button", { name: parentRequestCopy.approve }));
    expect(await screen.findByText("This request changed.")).toBeOnTheScreen();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.family("parent-1") });
  });

  it("confirms a put-in with one key per row", async () => {
    (callComplete as jest.Mock).mockResolvedValue("completed");
    await renderItems([
      { ...withdrawal, request: { ...withdrawal.request, kind: "deposit", reason: null } },
    ]);
    await userEvent.setup().press(screen.getByRole("button", { name: parentRequestCopy.confirm }));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(parentRequestCopy.depositDone));
    expect(callComplete).toHaveBeenCalledWith(
      { id: "client" },
      { requestId: "request-1", idempotencyKey: "55555555-5555-4555-8555-555555555555" },
    );
  });

  it("says no to a put-in", async () => {
    (callDecideDeposit as jest.Mock).mockResolvedValue("rejected");
    await renderItems([
      { ...withdrawal, request: { ...withdrawal.request, kind: "deposit", reason: null } },
    ]);
    await userEvent
      .setup()
      .press(screen.getByRole("button", { name: parentRequestCopy.didntGetIt }));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(parentRequestCopy.depositRejected));
    expect(callDecideDeposit).toHaveBeenCalledWith(
      { id: "client" },
      { requestId: "request-1", note: "" },
    );
  });

  it("confirms an approved take-out was handed over", async () => {
    (callComplete as jest.Mock).mockResolvedValue("completed");
    await renderItems([{ ...withdrawal, request: { ...withdrawal.request, status: "approved" } }]);
    await userEvent.setup().press(screen.getByRole("button", { name: parentRequestCopy.confirm }));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(parentRequestCopy.handedOver));
  });
});
