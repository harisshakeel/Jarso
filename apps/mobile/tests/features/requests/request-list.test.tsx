import { AppError } from "@jarso/core/lib";
import { statusLabel } from "@jarso/core/requests";
import { getFamilyContext } from "@jarso/data/family";
import { callCancel, listRequestsFor } from "@jarso/data/requests";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { RequestList } from "@/features/requests";
import { apiFetch } from "@/lib/api";
import { keys } from "@/lib/query";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "child", userId: "child-1" }),
}));
jest.mock("@jarso/data/requests", () => ({
  listRequestsFor: jest.fn(),
  callCancel: jest.fn(),
  getAvailability: jest.fn().mockResolvedValue({}),
}));
jest.mock("@jarso/data/family", () => ({ getFamilyContext: jest.fn() }));
jest.mock("@jarso/data/ledger", () => ({ getJars: jest.fn().mockResolvedValue({}) }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: "success" },
}));

const list = listRequestsFor as jest.Mock;
const cancel = callCancel as jest.Mock;
const context = getFamilyContext as jest.Mock;
const dispatch = apiFetch as jest.Mock;

const base = {
  auto: false,
  reason: null,
  occurredAt: "2026-11-02T10:00:00Z",
  amountMinor: 500,
};

function setup(requests: unknown[]) {
  list.mockResolvedValue(requests);
  context.mockResolvedValue({ currency: "GBP", timezone: "Europe/London", today: "2026-11-02" });
}

async function renderList() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
  const invalidate = jest.spyOn(client, "invalidateQueries");
  const view = await render(
    <QueryClientProvider client={client}>
      <RequestList />
    </QueryClientProvider>,
  );
  return { client, invalidate, ...view };
}

beforeEach(() => {
  jest.clearAllMocks();
  list.mockReset();
  cancel.mockReset();
  dispatch.mockResolvedValue(undefined);
});

describe("RequestList", () => {
  it("says so when there is nothing yet", async () => {
    setup([]);
    await renderList();
    expect(await screen.findByText("Nothing here yet.")).toBeOnTheScreen();
    expect(
      screen.getByText("When you move money or ask for extra, it shows up here."),
    ).toBeOnTheScreen();
  });

  it("shows each kind, amount, day, reason and the web's status label", async () => {
    setup([
      { ...base, id: "a", kind: "withdrawal", status: "pending", reason: "Game" },
      { ...base, id: "b", kind: "deposit", status: "confirmed", amountMinor: 1250 },
      { ...base, id: "c", kind: "emergency", status: "approved" },
      { ...base, id: "d", kind: "withdrawal", status: "handed_over" },
      { ...base, id: "e", kind: "emergency", status: "rejected" },
      { ...base, id: "f", kind: "deposit", status: "cancelled" },
    ]);
    await renderList();

    expect(await screen.findAllByText("Take out")).toHaveLength(2);
    expect(screen.getAllByText("Put in")).toHaveLength(2);
    expect(screen.getAllByText("Extra")).toHaveLength(2);
    expect(screen.getByText("£12.50")).toBeOnTheScreen();
    expect(screen.getByText("2 Nov · Game")).toBeOnTheScreen();
    expect(screen.getAllByText(statusLabel("withdrawal", "pending"))).toHaveLength(1);
    expect(screen.getAllByText("Done")).toHaveLength(2);
    expect(screen.getByText("Said yes")).toBeOnTheScreen();
    expect(screen.getByText("Not now")).toBeOnTheScreen();
    expect(screen.getByText("Cancelled")).toBeOnTheScreen();
  });

  it("offers Cancel only on a Waiting request", async () => {
    setup([
      { ...base, id: "a", kind: "withdrawal", status: "pending" },
      { ...base, id: "b", kind: "deposit", status: "approved" },
      { ...base, id: "c", kind: "deposit", status: "confirmed" },
      { ...base, id: "d", kind: "emergency", status: "rejected" },
    ]);
    await renderList();
    await screen.findByText("Waiting");
    expect(screen.getAllByText("Cancel")).toHaveLength(1);
    expect(screen.getByLabelText("Cancel take out of £5")).toBeOnTheScreen();
  });

  it("cancels, refreshes, tells the parent and says Cancelled", async () => {
    setup([{ ...base, id: "req-1", kind: "withdrawal", status: "pending" }]);
    cancel.mockResolvedValue("cancelled");
    const { invalidate } = await renderList();
    const user = userEvent.setup();

    await user.press(await screen.findByLabelText("Cancel take out of £5"));

    expect(await screen.findByText("Cancelled")).toBeOnTheScreen();
    expect(cancel).toHaveBeenCalledWith({ id: "client" }, "req-1");
    for (const key of [keys.requests("child-1"), keys.home("child-1"), keys.history("child-1")]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
    }
    expect(dispatch).toHaveBeenCalledWith("/api/v1/notices/dispatch", expect.anything());
    expect(Haptics.notificationAsync).toHaveBeenCalled();
  });

  it("says calmly when it already moved on", async () => {
    setup([{ ...base, id: "req-1", kind: "withdrawal", status: "pending" }]);
    cancel.mockResolvedValue("already_closed");
    await renderList();
    const user = userEvent.setup();

    await user.press(await screen.findByLabelText("Cancel take out of £5"));

    expect(await screen.findByText("This one already moved on.")).toBeOnTheScreen();
  });

  it("shows the safe message when cancelling fails and lets the child try again", async () => {
    setup([{ ...base, id: "req-1", kind: "withdrawal", status: "pending" }]);
    cancel.mockRejectedValueOnce(new AppError("INTERNAL", "Something went wrong. Try again."));
    cancel.mockResolvedValueOnce("cancelled");
    await renderList();
    const user = userEvent.setup();

    await user.press(await screen.findByLabelText("Cancel take out of £5"));
    expect(await screen.findByText("Something went wrong. Try again.")).toBeOnTheScreen();
    expect(dispatch).not.toHaveBeenCalled();

    await user.press(screen.getByLabelText("Cancel take out of £5"));
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(2));
  });

  it("shows the safe message when the list cannot load, with Try again", async () => {
    list.mockRejectedValueOnce(new AppError("INTERNAL", "Something went wrong. Try again."));
    context.mockResolvedValue({ currency: "GBP", timezone: "Europe/London", today: "2026-11-02" });
    await renderList();
    expect(await screen.findByText("Something went wrong. Try again.")).toBeOnTheScreen();
    list.mockResolvedValue([]);
    await userEvent.setup().press(screen.getByLabelText("Try again"));
    expect(await screen.findByText("Nothing here yet.")).toBeOnTheScreen();
  });

  // Last: two presses in one frame overlap act() and upset the tests after them.
  it("sends one cancel for a double press in the same frame", async () => {
    setup([{ ...base, id: "req-1", kind: "withdrawal", status: "pending" }]);
    let resolve: (v: string) => void = () => undefined;
    cancel.mockReturnValue(new Promise((r) => (resolve = r)));
    await renderList();
    const button = await screen.findByLabelText("Cancel take out of £5");

    // Both presses start before React re-renders, which is what overlaps act() calls.
    const quiet = jest.spyOn(console, "error").mockImplementation(() => undefined);
    await Promise.all([fireEvent.press(button), fireEvent.press(button)]);
    quiet.mockRestore();
    expect(cancel).toHaveBeenCalledTimes(1);
    resolve("cancelled");
    expect(await screen.findByText("Cancelled")).toBeOnTheScreen();
  });
});
