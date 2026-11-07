import {
  allowanceErrors,
  allowanceFormCopy,
  allowanceSummaryCopy,
  pauseCopy,
  type Schedule,
} from "@jarso/core/allowance";
import { AppError } from "@jarso/core/lib";
import {
  changeAllowance,
  createAllowance,
  getParentSchedule,
  pauseAllowance,
  resumeAllowance,
  stopAllowance,
} from "@jarso/data/allowance";
import {
  findFamilyById,
  findMembership,
  getFamilyContext,
  listChildMembers,
} from "@jarso/data/family";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";
import { AllowanceScreen } from "@/features/allowance";
import { flash } from "@/lib/flash";
import { dispatchNotices } from "@/lib/notices";
import { keys } from "@/lib/query";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/notices", () => ({ dispatchNotices: jest.fn() }));
jest.mock("@/lib/flash", () => ({ flash: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
const mockRouter = { push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
jest.mock("@jarso/data/family", () => ({
  findMembership: jest.fn(),
  findFamilyById: jest.fn(),
  listChildMembers: jest.fn(),
  getFamilyContext: jest.fn(),
}));
jest.mock("@jarso/data/allowance", () => ({
  getParentSchedule: jest.fn(),
  createAllowance: jest.fn(),
  changeAllowance: jest.fn(),
  pauseAllowance: jest.fn(),
  resumeAllowance: jest.fn(),
  stopAllowance: jest.fn(),
}));

const CHILD = "22222222-2222-4222-8222-222222222222";
const SCHEDULE = "33333333-3333-4333-8333-333333333333";
const TODAY = "2026-11-04";

const ACTIVE: Schedule = {
  id: SCHEDULE,
  amountMinor: 500,
  frequency: "weekly",
  status: "active",
  anchorOn: "2026-11-01",
  nextDueOn: "2026-11-08",
  pausedThrough: null,
  pauseMessage: null,
  autoCharge: false,
  autoChargeProvider: null,
  autoChargeMine: false,
  saveMinor: null,
};

function setup(schedule: Schedule | null) {
  (findMembership as jest.Mock).mockResolvedValue({ familyId: "family-1", role: "parent" });
  (findFamilyById as jest.Mock).mockResolvedValue({
    id: "family-1",
    code: "ABC123",
    currency: "GBP",
    timezone: "Europe/London",
  });
  (listChildMembers as jest.Mock).mockResolvedValue([{ id: CHILD, nickname: "Sam" }]);
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: TODAY,
  });
  (getParentSchedule as jest.Mock).mockResolvedValue(schedule);
}

function pickDate(iso: string) {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  (DateTimePickerAndroid.open as jest.Mock).mockImplementation(({ onChange }) =>
    onChange({ type: "set", nativeEvent: {} }, new Date(y, m - 1, d)),
  );
}

async function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = jest.spyOn(client, "invalidateQueries");
  const view = await render(
    <QueryClientProvider client={client}>
      <AllowanceScreen childId={CHILD} />
    </QueryClientProvider>,
  );
  return { invalidate, ...view };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AllowanceScreen", () => {
  it("sets one up with the amount, how often and first date", async () => {
    setup(null);
    (createAllowance as jest.Mock).mockResolvedValue(SCHEDULE);
    const { invalidate } = await renderScreen();
    fireEvent.changeText(await screen.findByLabelText(allowanceFormCopy.amount), "5");
    await userEvent.setup().press(screen.getByRole("button", { name: allowanceFormCopy.save }));

    await waitFor(() =>
      expect(createAllowance).toHaveBeenCalledWith(
        { id: "client" },
        { childId: CHILD, amountMinor: 500, frequency: "weekly", firstOn: TODAY, saveMinor: 100 },
      ),
    );
    await waitFor(() => expect(flash).toHaveBeenCalledWith(allowanceFormCopy.saved));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.child(CHILD) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.family("parent-1") });
    expect(dispatchNotices).toHaveBeenCalled();
  });

  it("create when one exists shows alreadyExists", async () => {
    setup(null);
    (createAllowance as jest.Mock).mockRejectedValue(
      new AppError("CONFLICT", allowanceErrors.alreadyExists),
    );
    await renderScreen();
    fireEvent.changeText(await screen.findByLabelText(allowanceFormCopy.amount), "5");
    await userEvent.setup().press(screen.getByRole("button", { name: allowanceFormCopy.save }));

    expect(await screen.findByRole("alert")).toHaveTextContent(allowanceErrors.alreadyExists);
    expect(flash).not.toHaveBeenCalled();
  });

  it("change with an invalid next date shows NEXT_ON on the field", async () => {
    setup(ACTIVE);
    (changeAllowance as jest.Mock).mockRejectedValue(
      new AppError("VALIDATION", allowanceErrors.nextOn, {
        fieldErrors: { nextOn: [allowanceErrors.nextOn] },
      }),
    );
    await renderScreen();
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: allowanceSummaryCopy.change }));
    pickDate("2026-11-20");
    await user.press(screen.getByRole("button", { name: allowanceFormCopy.nextOn }));
    await user.press(screen.getByRole("button", { name: allowanceFormCopy.save }));

    await waitFor(() =>
      expect(changeAllowance).toHaveBeenCalledWith(
        { id: "client" },
        {
          scheduleId: SCHEDULE,
          amountMinor: 500,
          frequency: "weekly",
          nextOn: "2026-11-20",
          saveMinor: 100,
        },
      ),
    );
    // On the date field, not as a form-wide alert.
    expect(await screen.findByText(allowanceErrors.nextOn)).toBeOnTheScreen();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("pause until a date sends through", async () => {
    setup(ACTIVE);
    (pauseAllowance as jest.Mock).mockResolvedValue(undefined);
    const { invalidate } = await renderScreen();
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: pauseCopy.pause }));
    pickDate("2026-11-20");
    await user.press(screen.getByRole("button", { name: pauseCopy.pauseUntil }));
    const buttons = screen.getAllByRole("button", { name: pauseCopy.pause });
    await user.press(buttons[buttons.length - 1] as never);

    await waitFor(() =>
      expect(pauseAllowance).toHaveBeenCalledWith(
        { id: "client" },
        { scheduleId: SCHEDULE, through: "2026-11-20", message: null },
      ),
    );
    await waitFor(() => expect(flash).toHaveBeenCalledWith(pauseCopy.paused));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.child(CHILD) });
    expect(dispatchNotices).toHaveBeenCalled();
  });

  it("resume sends the schedule", async () => {
    setup({ ...ACTIVE, status: "paused", nextDueOn: null });
    (resumeAllowance as jest.Mock).mockResolvedValue(undefined);
    await renderScreen();
    await userEvent
      .setup()
      .press(await screen.findByRole("button", { name: allowanceSummaryCopy.resume }));
    await waitFor(() => expect(resumeAllowance).toHaveBeenCalledWith({ id: "client" }, SCHEDULE));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(allowanceSummaryCopy.resumed));
  });

  it("stop asks to confirm", async () => {
    setup(ACTIVE);
    (stopAllowance as jest.Mock).mockResolvedValue(undefined);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await renderScreen();
    await userEvent
      .setup()
      .press(await screen.findByRole("button", { name: allowanceSummaryCopy.stop }));

    expect(alert).toHaveBeenCalledWith(
      allowanceSummaryCopy.stopTitle("Sam"),
      allowanceSummaryCopy.stopBody,
      expect.any(Array),
    );
    expect(stopAllowance).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
    buttons.find((button) => button.style === "destructive")?.onPress?.();
    await waitFor(() => expect(stopAllowance).toHaveBeenCalledWith({ id: "client" }, SCHEDULE));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(allowanceSummaryCopy.stopped));
  });

  describe("the Spend/Save split", () => {
    // The form is up before the screen's reads settle; wait until the typed amount is shown.
    async function typeAmount(value: string) {
      fireEvent.changeText(await screen.findByLabelText(allowanceFormCopy.amount), value);
      await waitFor(() =>
        expect(screen.getByLabelText(allowanceFormCopy.amount)).toHaveDisplayValue(value),
      );
    }
    const save = () => screen.getByLabelText(allowanceFormCopy.saveAmount);
    const submit = () =>
      userEvent.setup().press(screen.getByRole("button", { name: allowanceFormCopy.save }));

    it("a new allowance starts at 25% to Save and shows both parts", async () => {
      setup(null);
      (createAllowance as jest.Mock).mockResolvedValue(SCHEDULE);
      await renderScreen();
      await typeAmount("20");
      expect(screen.getByRole("radio", { name: allowanceFormCopy.shareLabel(25) })).toBeChecked();
      expect(save()).toHaveDisplayValue("5.00");
      expect(screen.getByText(allowanceFormCopy.splitLine("£15", "£5"))).toBeOnTheScreen();
      await submit();
      await waitFor(() =>
        expect(createAllowance).toHaveBeenCalledWith(
          { id: "client" },
          expect.objectContaining({ amountMinor: 2000, saveMinor: 500 }),
        ),
      );
    });

    it("Save follows the amount while a share is picked", async () => {
      setup(null);
      await renderScreen();
      await typeAmount("10");
      await userEvent
        .setup()
        .press(screen.getByRole("radio", { name: allowanceFormCopy.shareLabel(50) }));
      expect(save()).toHaveDisplayValue("5.00");
      await typeAmount("30");
      expect(save()).toHaveDisplayValue("15.00");
    });

    it("All Spend sends 0", async () => {
      setup(null);
      (createAllowance as jest.Mock).mockResolvedValue(SCHEDULE);
      await renderScreen();
      await typeAmount("5");
      await userEvent
        .setup()
        .press(screen.getByRole("radio", { name: allowanceFormCopy.shareLabel(0) }));
      await submit();
      await waitFor(() =>
        expect(createAllowance).toHaveBeenCalledWith(
          { id: "client" },
          expect.objectContaining({ saveMinor: 0 }),
        ),
      );
    });

    it("a typed Save is sent exactly and leaves the shares", async () => {
      setup(null);
      (createAllowance as jest.Mock).mockResolvedValue(SCHEDULE);
      await renderScreen();
      await typeAmount("5");
      fireEvent.changeText(save(), "1.30");
      await waitFor(() => expect(save()).toHaveDisplayValue("1.30"));
      expect(
        screen.getByRole("radio", { name: allowanceFormCopy.shareLabel(25) }),
      ).not.toBeChecked();
      await submit();
      await waitFor(() =>
        expect(createAllowance).toHaveBeenCalledWith(
          { id: "client" },
          expect.objectContaining({ amountMinor: 500, saveMinor: 130 }),
        ),
      );
    });

    it("a Save over the amount shows on the field and sends nothing", async () => {
      setup(null);
      await renderScreen();
      await typeAmount("5");
      fireEvent.changeText(save(), "6");
      await waitFor(() => expect(save()).toHaveDisplayValue("6"));
      await submit();
      expect(await screen.findByText(allowanceFormCopy.saveOver)).toBeOnTheScreen();
      expect(createAllowance).not.toHaveBeenCalled();
    });

    it("changing opens on the allowance's own Save", async () => {
      setup({ ...ACTIVE, amountMinor: 1000, saveMinor: 300 });
      (changeAllowance as jest.Mock).mockResolvedValue(undefined);
      await renderScreen();
      expect(await screen.findByText(allowanceSummaryCopy.split("£7", "£3"))).toBeOnTheScreen();
      await userEvent
        .setup()
        .press(screen.getByRole("button", { name: allowanceSummaryCopy.change }));
      expect(save()).toHaveDisplayValue("3.00");
      expect(
        screen.getByRole("radio", { name: allowanceFormCopy.shareLabel(25) }),
      ).not.toBeChecked();
      await submit();
      await waitFor(() =>
        expect(changeAllowance).toHaveBeenCalledWith(
          { id: "client" },
          expect.objectContaining({ amountMinor: 1000, saveMinor: 300 }),
        ),
      );
    });
  });
});
