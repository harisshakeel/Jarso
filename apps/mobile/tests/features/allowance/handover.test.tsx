import { allowanceErrors, handoverCopy } from "@jarso/core/allowance";
import { AppError } from "@jarso/core/lib";
import { parentRequestCopy } from "@jarso/core/requests";
import {
  confirmHandover,
  getLastSplitWith,
  listDueForParent,
  markNotGiven,
} from "@jarso/data/allowance";
import { findFamilyById, findMembership, listChildMembers } from "@jarso/data/family";
import { getGoalView } from "@jarso/data/goals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";
import { HandoverSheet } from "@/features/allowance";
import { formatMoney } from "@/lib";
import { flash } from "@/lib/flash";
import { dispatchNotices } from "@/lib/notices";

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

const CHILD = "22222222-2222-4222-8222-222222222222";
const OCC = "11111111-1111-4111-8111-111111111111";
const due = { kind: "allowance", id: OCC, dueOn: "2026-11-03", amountMinor: 300, note: null };
const confirm = confirmHandover as jest.Mock;
const onClose = jest.fn();

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
}

function renderSheet(kind: "allowance" | "gift" = "allowance") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { gcTime: Number.POSITIVE_INFINITY },
    },
  });
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

  it("an item no longer due says Already sorted and closes", async () => {
    setup([]);
    await renderSheet();
    await waitFor(() => expect(flash).toHaveBeenCalledWith(parentRequestCopy.settled));
    expect(onClose).toHaveBeenCalled();
  });
});
