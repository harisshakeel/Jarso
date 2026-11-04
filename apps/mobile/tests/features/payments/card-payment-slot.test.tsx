import { AppError } from "@jarso/core/lib";
import {
  type CardPaymentState,
  failureCopy,
  type InAppProviders,
  type PaymentStatusView,
  paymentCopy,
} from "@jarso/core/payments";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import {
  cancelInAppPayment,
  getPaymentProviders,
  getPaymentStatus,
  startInAppPayment,
} from "@/features/payments/api";
import { CardPaymentSlot, type CardPaymentSlotProps } from "@/features/payments/card-payment-slot";
import { presentSheet } from "@/features/payments/sheets";
import { flash } from "@/lib/flash";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/flash", () => ({ flash: jest.fn() }));
jest.mock("expo-network", () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock("@/features/auth/use-session", () => ({
  useSession: () => ({ status: "parent", role: "parent", userId: "parent-1" }),
}));
jest.mock("@/features/payments/api", () => ({
  startInAppPayment: jest.fn(),
  getPaymentStatus: jest.fn(),
  cancelInAppPayment: jest.fn(),
  getPaymentProviders: jest.fn(),
  completeFakeSheet: jest.fn(),
}));
jest.mock("@/features/payments/sheets", () => ({
  presentSheet: jest.fn(),
  useFakeSheet: () => ({ element: null, open: jest.fn() }),
}));

const ITEM = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const sheet = {
  provider: "stripe",
  mode: "payment",
  publishableKey: "pk_test_X",
  customerId: "cus_1",
  ephemeralKey: "ek_1",
  clientSecret: "pi_1_secret_x",
} as const;

const provider = (id: "stripe" | "razorpay", label: string) => ({
  id,
  label,
  available: true,
  unavailableReason: null,
});

function item(overrides: Partial<CardPaymentState> = {}): InAppProviders {
  return {
    cards: [],
    item: {
      providers: [provider("stripe", "Stripe")],
      pending: null,
      lastOutcome: null,
      ...overrides,
    },
  };
}

const status = (
  value: PaymentStatusView["status"],
  failureCode: PaymentStatusView["failureCode"] = null,
): PaymentStatusView => ({
  id: "p1",
  status: value,
  failureCode,
  final: value !== "pending" && value !== "requires_action",
});

const props: CardPaymentSlotProps = {
  kind: "allowance",
  id: ITEM,
  childId: CHILD,
  amountMinor: 500,
  currency: "GBP",
};

async function renderSlot(extra: Partial<CardPaymentSlotProps> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  await render(
    <QueryClientProvider client={client}>
      <CardPaymentSlot {...props} {...extra} />
    </QueryClientProvider>,
  );
}

const start = startInAppPayment as jest.Mock;
const present = presentSheet as jest.Mock;
const read = getPaymentStatus as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  start.mockResolvedValue({ paymentId: "p1", expiresAt: "2026-11-04T12:31:00Z", sheet });
});

describe("CardPaymentSlot", () => {
  it("renders nothing when card payments are off", async () => {
    (getPaymentProviders as jest.Mock).mockResolvedValue(item({ providers: [] }));
    await renderSlot();
    await waitFor(() => expect(getPaymentProviders).toHaveBeenCalled());
    expect(screen.queryByText(paymentCopy.orPayByCard)).toBeNull();
    expect(screen.toJSON()).toBeNull();
  });

  it("shows Pay by card with one provider, and the test-mode line", async () => {
    (getPaymentProviders as jest.Mock).mockResolvedValue(item());
    await renderSlot();
    expect(await screen.findByText(paymentCopy.orPayByCard)).toBeTruthy();
    expect(screen.getByRole("button", { name: paymentCopy.payByCard })).toBeTruthy();
    expect(screen.getByText(paymentCopy.testMode)).toBeTruthy();
    expect(getPaymentProviders).toHaveBeenCalledWith({
      childId: CHILD,
      kind: "allowance",
      id: ITEM,
    });
  });

  it("shows Pay with Stripe and Pay with Razorpay when both are on", async () => {
    (getPaymentProviders as jest.Mock).mockResolvedValue(
      item({ providers: [provider("stripe", "Stripe"), provider("razorpay", "Razorpay")] }),
    );
    await renderSlot();
    expect(await screen.findByRole("button", { name: paymentCopy.payWith("Stripe") })).toBeTruthy();
    expect(screen.getByRole("button", { name: paymentCopy.payWith("Razorpay") })).toBeTruthy();
  });

  it("says why when no provider can take the amount", async () => {
    (getPaymentProviders as jest.Mock).mockResolvedValue(
      item({
        providers: [
          { id: "stripe", label: "Stripe", available: false, unavailableReason: "too_small" },
        ],
      }),
    );
    await renderSlot();
    const button = await screen.findByRole("button", { name: paymentCopy.payByCard });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText(paymentCopy.tooSmall)).toBeTruthy();
  });

  it("opens the sheet and never posts success", async () => {
    (getPaymentProviders as jest.Mock).mockResolvedValue(item());
    present.mockResolvedValue("completed");
    read.mockResolvedValue(status("succeeded"));
    await renderSlot();
    await userEvent
      .setup()
      .press(await screen.findByRole("button", { name: paymentCopy.payByCard }));
    expect(await screen.findByText(paymentCopy.received)).toBeTruthy();
    expect(start).toHaveBeenCalledTimes(1);
    expect(present).toHaveBeenCalledWith(sheet, expect.anything());
    expect(cancelInAppPayment).not.toHaveBeenCalled();
  });

  it("shows checking while the status is pending after the sheet", async () => {
    (getPaymentProviders as jest.Mock).mockResolvedValue(item());
    present.mockResolvedValue("completed");
    read.mockResolvedValue(status("pending"));
    await renderSlot();
    await userEvent
      .setup()
      .press(await screen.findByRole("button", { name: paymentCopy.payByCard }));
    expect(await screen.findByText(paymentCopy.confirming)).toBeTruthy();
  });

  it("shows the pending block with Pay again after the sheet is closed", async () => {
    (getPaymentProviders as jest.Mock).mockResolvedValue(
      item({ providers: [provider("stripe", "Stripe"), provider("razorpay", "Razorpay")] }),
    );
    present.mockResolvedValue("closed");
    read.mockResolvedValue(status("pending"));
    await renderSlot();
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: paymentCopy.payWith("Razorpay") }));
    expect(await screen.findByText(paymentCopy.pendingTitle)).toBeTruthy();
    expect(screen.getByText(paymentCopy.pendingDetail)).toBeTruthy();
    await user.press(screen.getByRole("button", { name: paymentCopy.payAgain }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    expect(start.mock.calls[1][0]).toMatchObject({ provider: "razorpay" });
  });

  it("cancels the live payment", async () => {
    (getPaymentProviders as jest.Mock).mockResolvedValue(item());
    present.mockResolvedValue("closed");
    read.mockResolvedValue(status("pending"));
    (cancelInAppPayment as jest.Mock).mockResolvedValue({ canceled: true });
    await renderSlot();
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: paymentCopy.payByCard }));
    await user.press(await screen.findByRole("button", { name: paymentCopy.cancelPayment }));
    await waitFor(() => expect(cancelInAppPayment).toHaveBeenCalledWith("p1"));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(paymentCopy.cancelled));
    expect(await screen.findByRole("button", { name: paymentCopy.payByCard })).toBeTruthy();
  });

  it("stops the spinner when the poll gives up and offers the payment again", async () => {
    jest.useFakeTimers();
    try {
      (getPaymentProviders as jest.Mock).mockResolvedValue(item());
      present.mockResolvedValue("completed");
      read.mockResolvedValue(status("pending"));
      await renderSlot();
      await act(async () => {
        fireEvent.press(await screen.findByRole("button", { name: paymentCopy.payByCard }));
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(125_000);
      });
      expect(screen.getByText(paymentCopy.pendingTitle)).toBeTruthy();
      expect(screen.getByRole("button", { name: paymentCopy.payAgain })).toBeTruthy();
      expect(screen.getByRole("button", { name: paymentCopy.cancelPayment })).toBeTruthy();
      expect(screen.queryByText(paymentCopy.stillConfirming)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("shows the live payment on reopen and Pay again reuses it", async () => {
    (getPaymentProviders as jest.Mock).mockResolvedValue(
      item({
        providers: [provider("stripe", "Stripe"), provider("razorpay", "Razorpay")],
        pending: { provider: "stripe", redirectUrl: null },
      }),
    );
    present.mockResolvedValue("closed");
    read.mockResolvedValue(status("pending"));
    await renderSlot();
    expect(await screen.findByText(paymentCopy.pendingTitle)).toBeTruthy();
    // Without this session's payment id, Cancel is not offered: a start to find it could
    // replace a web checkout with a new intent.
    expect(screen.queryByRole("button", { name: paymentCopy.cancelPayment })).toBeNull();
    await userEvent.setup().press(screen.getByRole("button", { name: paymentCopy.payAgain }));
    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(expect.objectContaining({ provider: "stripe" })),
    );
    expect(await screen.findByRole("button", { name: paymentCopy.cancelPayment })).toBeTruthy();
  });

  it("shows the decline reason when the payment failed", async () => {
    (getPaymentProviders as jest.Mock).mockResolvedValue(item());
    present.mockResolvedValue("completed");
    read.mockResolvedValue(status("failed", "insufficient_funds"));
    await renderSlot();
    await userEvent
      .setup()
      .press(await screen.findByRole("button", { name: paymentCopy.payByCard }));
    expect(await screen.findByText(paymentCopy.failedTitle)).toBeTruthy();
    expect(screen.getByText(failureCopy.insufficient_funds)).toBeTruthy();
    expect(screen.getByRole("button", { name: paymentCopy.payAgain })).toBeTruthy();
  });

  it("goes back to the buttons when the payment expired", async () => {
    (getPaymentProviders as jest.Mock).mockResolvedValue(item());
    present.mockResolvedValue("closed");
    read.mockResolvedValue(status("expired"));
    await renderSlot();
    const user = userEvent.setup();
    await user.press(await screen.findByRole("button", { name: paymentCopy.payByCard }));
    await waitFor(() => expect(read).toHaveBeenCalled());
    expect(await screen.findByText(paymentCopy.orPayByCard)).toBeTruthy();
    expect(screen.queryByText(paymentCopy.pendingTitle)).toBeNull();
  });

  it("sends the split when the form has one", async () => {
    (getPaymentProviders as jest.Mock).mockResolvedValue(item());
    present.mockResolvedValue("closed");
    read.mockResolvedValue(status("pending"));
    await renderSlot({ split: { spendMinor: 300, saveMinor: 200 } });
    await userEvent
      .setup()
      .press(await screen.findByRole("button", { name: paymentCopy.payByCard }));
    await waitFor(() =>
      expect(start).toHaveBeenCalledWith({
        kind: "allowance",
        id: ITEM,
        provider: "stripe",
        cashMinor: 300,
        savedMinor: 200,
      }),
    );
  });

  it("waits for the full amount when the split is short", async () => {
    (getPaymentProviders as jest.Mock).mockResolvedValue(item());
    await renderSlot({ split: { spendMinor: 300, saveMinor: 100 } });
    const button = await screen.findByRole("button", { name: paymentCopy.payByCard });
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText(paymentCopy.fullAmount)).toBeTruthy();
  });

  it("says the card form didn't load when the sheet can't open", async () => {
    (getPaymentProviders as jest.Mock).mockResolvedValue(item());
    present.mockRejectedValue(new AppError("INTERNAL", paymentCopy.cardFormFailed));
    await renderSlot();
    await userEvent
      .setup()
      .press(await screen.findByRole("button", { name: paymentCopy.payByCard }));
    expect(await screen.findByText(paymentCopy.cardFormFailed)).toBeTruthy();
  });

  it("shows the server's message when the start is refused", async () => {
    (getPaymentProviders as jest.Mock).mockResolvedValue(item());
    start.mockRejectedValue(new AppError("CONFLICT", paymentCopy.inProgress));
    await renderSlot();
    await userEvent
      .setup()
      .press(await screen.findByRole("button", { name: paymentCopy.payByCard }));
    expect(await screen.findByText(paymentCopy.inProgress)).toBeTruthy();
    expect(present).not.toHaveBeenCalled();
  });
});
