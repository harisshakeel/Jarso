import { AppError } from "@jarso/core/lib";
import { type AutoChargeCard, paymentCopy } from "@jarso/core/payments";
import { getFamilyContext } from "@jarso/data/family";
import { fetchAutoChargeState } from "@jarso/data/payments";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { getPaymentProviders, setAutoCharge } from "@/features/payments/api";
import { AutoChargeSlot, type AutoChargeSlotProps } from "@/features/payments/auto-charge-slot";
import { presentSheet } from "@/features/payments/sheets";

jest.mock("@/lib/supabase/client", () => ({ supabase: { id: "client" } }));
jest.mock("@/lib/flash", () => ({ flash: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
jest.mock("@jarso/data/family", () => ({ getFamilyContext: jest.fn() }));
jest.mock("@jarso/data/payments", () => ({ fetchAutoChargeState: jest.fn() }));
jest.mock("@/features/payments/api", () => ({
  setAutoCharge: jest.fn(),
  getPaymentProviders: jest.fn(),
  completeFakeSheet: jest.fn(),
}));
jest.mock("@/features/payments/sheets", () => ({
  presentSheet: jest.fn(),
  useFakeSheet: () => ({ element: null, open: jest.fn() }),
}));

const SCHEDULE = "33333333-3333-4333-8333-333333333333";
const GIFT = "44444444-4444-4444-8444-444444444444";
const visa = { brand: "visa", last4: "4242" };

const card = (
  provider: "stripe" | "razorpay",
  overrides: Partial<AutoChargeCard> = {},
): AutoChargeCard => ({
  provider,
  label: provider === "stripe" ? "Stripe" : "Razorpay",
  cardSaved: false,
  card: null,
  unavailableReason: null,
  needsPhone: provider === "razorpay",
  ...overrides,
});
const saved = (provider: "stripe" | "razorpay") => card(provider, { cardSaved: true, card: visa });

const off = { on: false, provider: null, by: null, overdue: false };
const onWith = (provider: "stripe" | "razorpay", by = "parent-1") => ({
  on: true,
  provider,
  by,
  overdue: false,
});

const readState = fetchAutoChargeState as jest.Mock;
const patch = setAutoCharge as jest.Mock;
const present = presentSheet as jest.Mock;

function setup(cards: AutoChargeCard[], state: object = off) {
  (getFamilyContext as jest.Mock).mockResolvedValue({
    currency: "GBP",
    timezone: "Europe/London",
    today: "2026-11-04",
  });
  (getPaymentProviders as jest.Mock).mockResolvedValue({ cards, item: null });
  readState.mockResolvedValue(state);
}

async function renderSlot(
  target: AutoChargeSlotProps["target"] = { kind: "schedule", id: SCHEDULE },
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  await render(
    <QueryClientProvider client={client}>
      <AutoChargeSlot target={target} />
    </QueryClientProvider>,
  );
}

async function turn(next: boolean) {
  const toggle = await screen.findByRole("switch", { name: paymentCopy.autoCharge });
  await act(async () => {
    fireEvent(toggle, "valueChange", next);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  patch.mockResolvedValue({ setup: null });
});

describe("AutoChargeSlot", () => {
  it("renders nothing when no provider has a native sheet", async () => {
    setup([]);
    await renderSlot();
    await waitFor(() => expect(getPaymentProviders).toHaveBeenCalled());
    expect(screen.toJSON()).toBeNull();
  });

  it("turns on with the single saved card", async () => {
    setup([saved("stripe")]);
    await renderSlot();
    expect(await screen.findByText(paymentCopy.autoChargeAllowance)).toBeTruthy();
    await turn(true);
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith({
        type: "allowance_schedule",
        id: SCHEDULE,
        on: true,
        provider: "stripe",
      }),
    );
    expect(present).not.toHaveBeenCalled();
  });

  it("names the card it charges while on", async () => {
    setup([saved("stripe")], onWith("stripe"));
    await renderSlot();
    expect(
      await screen.findByText(paymentCopy.charges(paymentCopy.cardEnding("visa", "4242"))),
    ).toBeTruthy();
    expect(screen.getByText(paymentCopy.testMode)).toBeTruthy();
  });

  it("names only the provider when another parent's card pays", async () => {
    setup([saved("stripe")], onWith("stripe", "parent-2"));
    await renderSlot();
    expect(await screen.findByText(paymentCopy.chargesOther("Stripe"))).toBeTruthy();
  });

  it("asks which card when several are saved", async () => {
    setup([saved("stripe"), saved("razorpay")]);
    await renderSlot();
    await turn(true);
    expect(await screen.findByText(paymentCopy.chooseCardTitle)).toBeTruthy();
    const label = paymentCopy.cardAt(paymentCopy.cardEnding("visa", "4242"), "Razorpay");
    await userEvent.setup().press(screen.getByRole("button", { name: label }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        expect.objectContaining({ on: true, provider: "razorpay" }),
      ),
    );
  });

  it("asks for the mobile number before saving with Razorpay", async () => {
    setup([card("stripe"), card("razorpay")]);
    const sheet = { provider: "razorpay", mode: "setup", keyId: "rzp_test_XXXXXXXX" };
    patch.mockResolvedValue({ setup: { setupId: "set-1", sheet } });
    present.mockResolvedValue("closed");
    await renderSlot();
    await turn(true);
    expect(await screen.findByText(paymentCopy.saveCardTitle)).toBeTruthy();
    expect(screen.getByText(paymentCopy.mandate)).toBeTruthy();
    // Stripe is first: no phone needed yet.
    expect(screen.queryByText(paymentCopy.phoneLabel)).toBeNull();
    const user = userEvent.setup();
    await user.press(screen.getByRole("radio", { name: "Razorpay" }));
    expect(screen.getByText(paymentCopy.phoneHelp("Razorpay"))).toBeTruthy();
    await user.type(screen.getByLabelText(paymentCopy.phoneLabel), "+910000000000");
    await user.press(screen.getByRole("button", { name: paymentCopy.saveWith("Razorpay") }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith({
        type: "allowance_schedule",
        id: SCHEDULE,
        on: true,
        provider: "razorpay",
        phone: "+910000000000",
      }),
    );
    await waitFor(() => expect(present).toHaveBeenCalledWith(sheet, expect.anything()));
  });

  it("shows the phone error from the server under the field", async () => {
    setup([card("razorpay")]);
    patch.mockRejectedValue(
      new AppError("VALIDATION", "Check the form.", {
        fieldErrors: { phone: [paymentCopy.phoneInvalid] },
      }),
    );
    await renderSlot();
    await turn(true);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(paymentCopy.phoneLabel), "12");
    await user.press(screen.getByRole("button", { name: paymentCopy.saveWith("Razorpay") }));
    expect(await screen.findByText(paymentCopy.phoneInvalid)).toBeTruthy();
    expect(screen.getByText(paymentCopy.saveCardTitle)).toBeTruthy();
    expect(present).not.toHaveBeenCalled();
  });

  it("Not now closes the sheet and leaves it off", async () => {
    setup([card("stripe")]);
    await renderSlot();
    await turn(true);
    await userEvent.setup().press(await screen.findByRole("button", { name: paymentCopy.notNow }));
    await waitFor(() => expect(screen.queryByText(paymentCopy.saveCardTitle)).toBeNull());
    expect(patch).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: paymentCopy.autoCharge }).props.value).toBe(false);
  });

  it("shows Once it's saved when the card has not arrived after the sheet", async () => {
    jest.useFakeTimers();
    try {
      setup([card("stripe")]);
      const sheet = { provider: "fake", mode: "setup", ref: "r" };
      patch.mockResolvedValue({ setup: { setupId: "set-1", sheet } });
      present.mockResolvedValue("completed");
      await renderSlot();
      await turn(true);
      const save = await screen.findByRole("button", { name: paymentCopy.saveWith("Stripe") });
      await act(async () => {
        fireEvent.press(save);
      });
      await waitFor(() => expect(present).toHaveBeenCalled());
      const reads = readState.mock.calls.length;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(21_000);
      });
      expect(readState.mock.calls.length).toBeGreaterThan(reads + 5);
      expect(screen.getByText(paymentCopy.autoChargeLater)).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows a setup sheet that won't open under the switch and leaves it off", async () => {
    setup([card("stripe")]);
    patch.mockResolvedValue({ setup: { setupId: "set-1", sheet: { provider: "fake" } } });
    present.mockRejectedValue(new AppError("INTERNAL", paymentCopy.cardFormFailed));
    await renderSlot();
    await turn(true);
    await userEvent
      .setup()
      .press(await screen.findByRole("button", { name: paymentCopy.saveWith("Stripe") }));
    expect(await screen.findByText(paymentCopy.cardFormFailed)).toBeTruthy();
    expect(screen.queryByText(paymentCopy.saveCardTitle)).toBeNull();
    expect(screen.getByRole("switch", { name: paymentCopy.autoCharge }).props.value).toBe(false);
  });

  it("puts the switch back when the chosen card's setup sheet won't open", async () => {
    setup([saved("stripe"), saved("razorpay")]);
    patch.mockResolvedValue({ setup: { setupId: "set-1", sheet: { provider: "fake" } } });
    present.mockRejectedValue(new AppError("INTERNAL", paymentCopy.cardFormFailed));
    await renderSlot();
    await turn(true);
    const label = paymentCopy.cardAt(paymentCopy.cardEnding("visa", "4242"), "Stripe");
    await userEvent.setup().press(await screen.findByRole("button", { name: label }));
    expect(await screen.findByText(paymentCopy.cardFormFailed)).toBeTruthy();
    expect(screen.getByRole("switch", { name: paymentCopy.autoCharge }).props.value).toBe(false);
  });

  it("turns off", async () => {
    setup([saved("stripe")], onWith("stripe"));
    await renderSlot();
    await turn(false);
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith({ type: "allowance_schedule", id: SCHEDULE, on: false }),
    );
  });

  it("shows the overdue note for a gift past its day", async () => {
    setup([saved("stripe")], { ...off, overdue: true });
    await renderSlot({ kind: "gift", id: GIFT });
    expect(await screen.findByText(paymentCopy.autoChargeOverdue)).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(readState).toHaveBeenCalledWith(
      { id: "client" },
      { type: "parent_gift", id: GIFT },
      "2026-11-04",
    );
  });
});
