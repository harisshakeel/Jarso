import { allowanceErrors, type Gift, giftCopy } from "@jarso/core/allowance";
import { cancelGift, createGift, findGift, listGiftsFor, updateGift } from "@jarso/data/allowance";
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
import { GiftScreen } from "@/features/allowance";
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
  getFamilyContext: jest.fn(),
}));
jest.mock("@jarso/data/allowance", () => ({
  listGiftsFor: jest.fn(),
  createGift: jest.fn(),
  findGift: jest.fn(),
  updateGift: jest.fn(),
  cancelGift: jest.fn(),
}));

const CHILD = "22222222-2222-4222-8222-222222222222";
const GIFT = "44444444-4444-4444-8444-444444444444";
const TODAY = "2026-11-04";

const DUE_GIFT: Gift = {
  id: GIFT,
  amountMinor: 1000,
  giveOn: "2026-11-01",
  note: "Well done",
  status: "pending",
  autoCharge: false,
  autoChargeProvider: null,
  autoChargeMine: false,
};

function setup(gifts: Gift[] = []) {
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
  (listGiftsFor as jest.Mock).mockResolvedValue(gifts);
}

function pickDate(iso: string) {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  (DateTimePickerAndroid.open as jest.Mock).mockImplementation(({ onChange }) =>
    onChange({ type: "set", nativeEvent: {} }, new Date(y, m - 1, d)),
  );
}

async function renderScreen(giftId?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = jest.spyOn(client, "invalidateQueries");
  const view = await render(
    <QueryClientProvider client={client}>
      <GiftScreen childId={CHILD} giftId={giftId} />
    </QueryClientProvider>,
  );
  return { invalidate, ...view };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUuid = 0;
});

describe("GiftScreen", () => {
  it("new gift saves once with the opening's key", async () => {
    setup();
    (createGift as jest.Mock).mockResolvedValue(GIFT);
    const { invalidate } = await renderScreen();
    fireEvent.changeText(await screen.findByLabelText(giftCopy.amount), "5");
    await userEvent.setup().press(screen.getByRole("button", { name: giftCopy.save }));

    await waitFor(() =>
      expect(createGift).toHaveBeenCalledWith(
        { id: "client" },
        {
          childId: CHILD,
          amountMinor: 500,
          giveOn: TODAY,
          note: null,
          idempotencyKey: "00000000-0000-4000-8000-000000000001",
        },
      ),
    );
    await waitFor(() => expect(flash).toHaveBeenCalledWith(giftCopy.saved));
    // Given today, so due now: its handover opens next, with the card payment.
    expect(mockRouter.replace).toHaveBeenCalledWith(
      `/(parent)/children/${CHILD}/handover/gift/${GIFT}`,
    );
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.child(CHILD) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.family("parent-1") });
    expect(dispatchNotices).toHaveBeenCalled();
  });

  it("a gift for a later day goes back to the child's page, not to a handover", async () => {
    setup();
    (createGift as jest.Mock).mockResolvedValue(GIFT);
    await renderScreen();
    const user = userEvent.setup();
    fireEvent.changeText(await screen.findByLabelText(giftCopy.amount), "5");
    pickDate("2026-11-20");
    await user.press(screen.getByRole("button", { name: giftCopy.giveOn }));
    await user.press(screen.getByRole("button", { name: giftCopy.save }));

    await waitFor(() => expect(flash).toHaveBeenCalledWith(giftCopy.saved));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("a re-send that returns the gift made for a later day goes back, not to a handover", async () => {
    setup();
    // The first reply was lost; the parent moved the date to today and saved again with the same
    // key, so the server returns the gift it already made, still for the later day.
    (createGift as jest.Mock)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(GIFT);
    (findGift as jest.Mock).mockResolvedValue({
      ...DUE_GIFT,
      childId: CHILD,
      giveOn: "2026-11-20",
    });
    await renderScreen();
    const user = userEvent.setup();
    fireEvent.changeText(await screen.findByLabelText(giftCopy.amount), "5");
    pickDate("2026-11-20");
    await user.press(screen.getByRole("button", { name: giftCopy.giveOn }));
    await user.press(screen.getByRole("button", { name: giftCopy.save }));
    await waitFor(() => expect(createGift).toHaveBeenCalledTimes(1));
    expect(flash).not.toHaveBeenCalledWith(giftCopy.saved);

    pickDate(TODAY);
    await user.press(screen.getByRole("button", { name: giftCopy.giveOn }));
    await user.press(screen.getByRole("button", { name: giftCopy.save }));

    await waitFor(() => expect(flash).toHaveBeenCalledWith(giftCopy.saved));
    const sent = (createGift as jest.Mock).mock.calls.map(([, input]) => input.idempotencyKey);
    expect(sent[0]).toBe(sent[1]);
    expect(findGift).toHaveBeenCalledWith({ id: "client" }, GIFT);
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("gift date in the past refused on new", async () => {
    setup();
    await renderScreen();
    const user = userEvent.setup();
    fireEvent.changeText(await screen.findByLabelText(giftCopy.amount), "5");
    pickDate("2026-11-01");
    await user.press(screen.getByRole("button", { name: giftCopy.giveOn }));
    await user.press(screen.getByRole("button", { name: giftCopy.save }));

    expect(await screen.findByText(allowanceErrors.giftDatePast)).toBeOnTheScreen();
    expect(createGift).not.toHaveBeenCalled();
  });

  it("edit keeps a due gift's past date", async () => {
    setup([DUE_GIFT]);
    (updateGift as jest.Mock).mockResolvedValue(undefined);
    await renderScreen(GIFT);
    await userEvent.setup().press(await screen.findByRole("button", { name: giftCopy.save }));

    await waitFor(() =>
      expect(updateGift).toHaveBeenCalledWith(
        { id: "client" },
        { giftId: GIFT, amountMinor: 1000, giveOn: "2026-11-01", note: "Well done" },
        TODAY,
      ),
    );
    await waitFor(() => expect(flash).toHaveBeenCalledWith(giftCopy.saved));
  });

  it("cancel asks to confirm, then cancels", async () => {
    setup([DUE_GIFT]);
    (cancelGift as jest.Mock).mockResolvedValue(undefined);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await renderScreen(GIFT);
    await userEvent
      .setup()
      .press(await screen.findByRole("button", { name: giftCopy.cancelTrigger }));

    expect(alert).toHaveBeenCalledWith(
      giftCopy.cancelTitle,
      giftCopy.cancelBody("Sam"),
      expect.any(Array),
    );
    expect(cancelGift).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
    buttons.find((button) => button.style === "destructive")?.onPress?.();

    await waitFor(() => expect(cancelGift).toHaveBeenCalledWith({ id: "client" }, GIFT));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(giftCopy.cancelled));
    expect(flash).not.toHaveBeenCalledWith(allowanceErrors.giftDone);
  });

  it("cancelled gift shows giftDone and goes back", async () => {
    setup([]);
    await renderScreen(GIFT);
    await waitFor(() => expect(flash).toHaveBeenCalledWith(allowanceErrors.giftDone));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(updateGift).not.toHaveBeenCalled();
  });
});
