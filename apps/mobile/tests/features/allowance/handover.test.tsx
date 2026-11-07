import { allowanceErrors, handoverCopy } from "@jarso/core/allowance";
import { familyCardsCopy } from "@jarso/core/dashboard";
import { AppError } from "@jarso/core/lib";
import { paymentCopy } from "@jarso/core/payments";
import { parentRequestCopy } from "@jarso/core/requests";
import {
  confirmHandover,
  getLastSplitWith,
  listDueForParent,
  markNotGiven,
} from "@jarso/data/allowance";
import { findFamilyById, findMembership, listChildMembers } from "@jarso/data/family";
import { getGoalView } from "@jarso/data/goals";
import { getProgress } from "@jarso/data/progress";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";
import { HandoverSheet } from "@/features/allowance";
import { formatMoney } from "@/lib";
import { apiFetch } from "@/lib/api";
import { flash } from "@/lib/flash";
import { dispatchNotices } from "@/lib/notices";
import { keys } from "@/lib/query";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/notices", () => ({ dispatchNotices: jest.fn() }));
jest.mock("@/lib/flash", () => ({ flash: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
let mockUuid = 0;
jest.mock("expo-crypto", () => ({
  randomUUID: () => `00000000-0000-4000-8000-00000000000${++mockUuid}`,
}));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
jest.mock("@jarso/data/family", () => ({
  findMembership: jest.fn(),
  findFamilyById: jest.fn(),
  listChildMembers: jest.fn(),
}));
jest.mock("@jarso/data/allowance", () => ({
  listDueForParent: jest.fn(),
  getLastSplitWith: jest.fn(),
  confirmHandover: jest.fn(),
  markNotGiven: jest.fn(),
}));
jest.mock("@jarso/data/goals", () => ({ getGoalView: jest.fn() }));
jest.mock("@jarso/data/progress", () => ({ getProgress: jest.fn() }));

const CHILD = "22222222-2222-4222-8222-222222222222";
const OCC = "11111111-1111-4111-8111-111111111111";
const due = {
  kind: "allowance",
  id: OCC,
  dueOn: "2026-11-03",
  amountMinor: 300,
  note: null,
  plannedSaveMinor: null,
};
const confirm = confirmHandover as jest.Mock;
const onClose = jest.fn();
const cardsOff = { cards: [], item: { providers: [], pending: null, lastOutcome: null } };
const cardsOn = {
  cards: [],
  item: {
    providers: [{ id: "stripe", label: "Stripe", available: true, unavailableReason: null }],
    pending: null,
    lastOutcome: null,
  },
};

function setup(items: unknown[] = [due]) {
  (findMembership as jest.Mock).mockResolvedValue({
    familyId: "family-1",
    role: "parent",
    status: "approved",
  });
  (findFamilyById as jest.Mock).mockResolvedValue({
    id: "family-1",
    code: "ABC123",
    currency: "GBP",
    timezone: "Europe/London",
  });
  (listChildMembers as jest.Mock).mockResolvedValue([{ id: CHILD, nickname: "Sam" }]);
  (listDueForParent as jest.Mock).mockResolvedValue(items);
  (getLastSplitWith as jest.Mock).mockResolvedValue(null);
  (getGoalView as jest.Mock).mockResolvedValue(null);
  (getProgress as jest.Mock).mockRejectedValue(new Error("off"));
  // GET /api/v1/payments/providers: card payments off unless a test says otherwise.
  (apiFetch as jest.Mock).mockResolvedValue(cardsOff);
}

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
}

function renderSheet(kind: "allowance" | "gift" = "allowance", client = newClient()) {
  return render(
    <QueryClientProvider client={client}>
      <HandoverSheet childId={CHILD} kind={kind} id={OCC} onClose={onClose} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUuid = 0;
});

describe("HandoverSheet", () => {
  it("a due allowance with a planned split opens on it, not on last time's", async () => {
    setup([{ ...due, plannedSaveMinor: 100 }]);
    (getLastSplitWith as jest.Mock).mockResolvedValue({ cash: 0, saved: 500 });
    await renderSheet();
    expect(await screen.findByLabelText(handoverCopy.cashLabel("Sam"))).toHaveDisplayValue("2.00");
    expect(screen.getByLabelText(handoverCopy.savedLabel)).toHaveDisplayValue("1.00");
  });

  it("without a plan it opens on last time's share", async () => {
    setup();
    (getLastSplitWith as jest.Mock).mockResolvedValue({ cash: 0, saved: 500 });
    await renderSheet();
    expect(await screen.findByLabelText(handoverCopy.cashLabel("Sam"))).toHaveDisplayValue("0.00");
    expect(screen.getByLabelText(handoverCopy.savedLabel)).toHaveDisplayValue("3.00");
  });

  it("the sheet opens on Jarso and the amount to the child", async () => {
    setup();
    await renderSheet();
    expect(
      await screen.findByRole("header", { name: familyCardsCopy.handoverTitle("£3.00", "Sam") }),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: handoverCopy.confirm })).toBeOnTheScreen();
  });

  it("the sheet does not wait for progress", async () => {
    setup();
    (getProgress as jest.Mock).mockReturnValue(new Promise(() => {}));
    await renderSheet();
    expect(await screen.findByRole("button", { name: handoverCopy.confirm })).toBeOnTheScreen();
    expect(getProgress).toHaveBeenCalledWith({ id: "client" }, CHILD);
  });

  it("double tap confirms once", async () => {
    setup();
    let finish: (value: string) => void = () => {};
    confirm.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await renderSheet();
    const button = await screen.findByRole("button", { name: handoverCopy.confirm });
    const user = userEvent.setup();
    await user.press(button);
    await user.press(button);
    finish("confirmed");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(
      { id: "client" },
      {
        kind: "allowance",
        id: OCC,
        cashMinor: 300,
        savedMinor: 0,
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
      },
    );
    expect(flash).toHaveBeenCalledWith(handoverCopy.handedOver("Sam"));
    expect(dispatchNotices).toHaveBeenCalled();
  });

  it("already_confirmed shows success", async () => {
    setup();
    confirm.mockResolvedValue("already_confirmed");
    await renderSheet();
    await userEvent
      .setup()
      .press(await screen.findByRole("button", { name: handoverCopy.confirm }));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(handoverCopy.alreadyHandled));
    expect(onClose).toHaveBeenCalled();
  });

  it("not_given conflict shows notGiven line", async () => {
    setup();
    confirm.mockRejectedValue(new AppError("CONFLICT", allowanceErrors.notGiven));
    await renderSheet();
    await userEvent
      .setup()
      .press(await screen.findByRole("button", { name: handoverCopy.confirm }));
    expect(await screen.findByText(allowanceErrors.notGiven)).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
    // The row is read again, so the sheet shows it as it is now.
    await waitFor(() => expect(listDueForParent).toHaveBeenCalledTimes(2));
  });

  it("split must add up to the amount", async () => {
    setup();
    await renderSheet();
    const user = userEvent.setup();
    const cash = await screen.findByLabelText(handoverCopy.cashLabel("Sam"));
    await user.clear(cash);
    await user.type(cash, "5");
    expect(await screen.findByText(handoverCopy.over(formatMoney(300, "GBP")))).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: handoverCopy.confirm })).toBeDisabled();

    await user.clear(cash);
    await user.type(cash, "0");
    await user.press(screen.getByRole("button", { name: handoverCopy.confirm }));
    expect(await screen.findByText("Enter what you handed over.")).toBeOnTheScreen();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("not given asks to confirm", async () => {
    setup();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    (markNotGiven as jest.Mock).mockResolvedValue("closed");
    await renderSheet();
    await userEvent
      .setup()
      .press(await screen.findByRole("button", { name: handoverCopy.notGiven }));
    expect(alert).toHaveBeenCalledWith(
      handoverCopy.notGivenTitle,
      handoverCopy.notGivenBody("Sam"),
      expect.any(Array),
    );
    expect(markNotGiven).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
    buttons.find((b) => b.text === handoverCopy.notGiven)?.onPress?.();
    await waitFor(() => expect(markNotGiven).toHaveBeenCalledWith({ id: "client" }, OCC));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(handoverCopy.markedNotGiven));
    expect(onClose).toHaveBeenCalled();
    alert.mockRestore();
  });

  it("a due list refetching without the item waits for the fresh one", async () => {
    setup([]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
    });
    // The list read before the gift was made, cached and now being read again.
    client.setQueryData(keys.childDue(CHILD), []);
    let finish: (items: unknown[]) => void = () => {};
    (listDueForParent as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await render(
      <QueryClientProvider client={client}>
        <HandoverSheet childId={CHILD} kind="allowance" id={OCC} onClose={onClose} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(listDueForParent).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(flash).not.toHaveBeenCalledWith(parentRequestCopy.settled);

    finish([due]);
    expect(await screen.findByRole("button", { name: handoverCopy.confirm })).toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("an item no longer due says Already sorted and closes", async () => {
    setup([]);
    await renderSheet();
    await waitFor(() => expect(flash).toHaveBeenCalledWith(parentRequestCopy.settled));
    expect(onClose).toHaveBeenCalled();
  });

  it("opens with the card block already in place, not pushed in later", async () => {
    setup();
    let finish: (value: unknown) => void = () => {};
    (apiFetch as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await renderSheet();
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/payments/providers?"),
        { auth: true },
      ),
    );
    // Everything else has loaded; the form still waits for the card read.
    await waitFor(() => expect(getGoalView).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: handoverCopy.confirm })).toBeNull();
    expect(screen.getByLabelText("Loading")).toBeOnTheScreen();

    finish(cardsOn);
    expect(await screen.findByRole("button", { name: handoverCopy.confirm })).toBeOnTheScreen();
    expect(screen.getByText(paymentCopy.orPayByCard)).toBeOnTheScreen();
  });

  it("a failed card read still opens the form, without the card block", async () => {
    setup();
    (apiFetch as jest.Mock).mockRejectedValue(new AppError("UNAVAILABLE", "Offline"));
    await renderSheet();
    expect(await screen.findByRole("button", { name: handoverCopy.confirm })).toBeOnTheScreen();
    expect(screen.queryByText(paymentCopy.orPayByCard)).toBeNull();
    // The slot reads again on mount; the form stays up while it does.
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: handoverCopy.confirm })).toBeOnTheScreen();
  });

  it("reopened after a failed card read, waits for the new read before showing the form", async () => {
    setup();
    const client = newClient();
    (apiFetch as jest.Mock).mockRejectedValue(new AppError("UNAVAILABLE", "Offline"));
    const first = await renderSheet("allowance", client);
    expect(await screen.findByRole("button", { name: handoverCopy.confirm })).toBeOnTheScreen();
    await first.unmount();

    // The failed read is still cached; this opening reads again and waits for it.
    let finish: (value: unknown) => void = () => {};
    (apiFetch as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await renderSheet("allowance", client);
    expect(screen.queryByRole("button", { name: handoverCopy.confirm })).toBeNull();
    expect(screen.getByLabelText("Loading")).toBeOnTheScreen();

    finish(cardsOn);
    expect(await screen.findByRole("button", { name: handoverCopy.confirm })).toBeOnTheScreen();
    expect(screen.getByText(paymentCopy.orPayByCard)).toBeOnTheScreen();
  });

  it("a slow card read holds the form only briefly, then the block lands in place", async () => {
    jest.useFakeTimers();
    try {
      setup();
      let finish: (value: unknown) => void = () => {};
      (apiFetch as jest.Mock).mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      await renderSheet();
      await waitFor(() => expect(getGoalView).toHaveBeenCalled());
      expect(screen.queryByRole("button", { name: handoverCopy.confirm })).toBeNull();

      // Past the short wait, the form opens without the block; the read keeps going.
      await act(() => jest.advanceTimersByTimeAsync(3_000));
      expect(screen.getByRole("button", { name: handoverCopy.confirm })).toBeOnTheScreen();
      expect(screen.queryByText(paymentCopy.orPayByCard)).toBeNull();

      finish(cardsOn);
      expect(await screen.findByText(paymentCopy.orPayByCard)).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it("reopened with an earlier answer cached, waits for the new read before showing the form", async () => {
    setup();
    const client = newClient();
    const first = await renderSheet("allowance", client);
    expect(await screen.findByRole("button", { name: handoverCopy.confirm })).toBeOnTheScreen();
    expect(screen.queryByText(paymentCopy.orPayByCard)).toBeNull();
    await first.unmount();

    // Card payments came on since: the cached "off" must not open the form early.
    let finish: (value: unknown) => void = () => {};
    (apiFetch as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await renderSheet("allowance", client);
    expect(screen.queryByRole("button", { name: handoverCopy.confirm })).toBeNull();
    expect(screen.getByLabelText("Loading")).toBeOnTheScreen();

    finish(cardsOn);
    expect(await screen.findByRole("button", { name: handoverCopy.confirm })).toBeOnTheScreen();
    expect(screen.getByText(paymentCopy.orPayByCard)).toBeOnTheScreen();
  });
});
