import { AppError } from "@jarso/core/lib";
import { type InAppSheet, paymentCopy } from "@jarso/core/payments";
import { initPaymentSheet, initStripe, presentPaymentSheet } from "@stripe/stripe-react-native";
import RazorpayCheckout from "react-native-razorpay";
import { presentSheet, type SheetOutcome } from "@/features/payments/sheets";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/features/payments/api", () => ({ completeFakeSheet: jest.fn() }));

const stripeSheet = (mode: "payment" | "setup"): InAppSheet => ({
  provider: "stripe",
  mode,
  publishableKey: "pk_test_X",
  customerId: "cus_1",
  ephemeralKey: "ek_1",
  clientSecret: mode === "payment" ? "pi_1_secret_x" : "seti_1_secret_x",
});

const razorpaySheet = (mode: "payment" | "setup"): InAppSheet => ({
  provider: "razorpay",
  mode,
  keyId: "rzp_test_XXXXXXXX",
  orderId: "order_1",
  amountMinor: mode === "payment" ? 50_000 : 100,
  currency: "INR",
  description: "Allowance for Sam",
  ...(mode === "setup"
    ? { customerId: "cust_1", prefill: { email: "parent@example.test", contact: "+910000000000" } }
    : {}),
});

const fakeSheet: Extract<InAppSheet, { provider: "fake" }> = {
  provider: "fake",
  mode: "payment",
  ref: "11111111-1111-4111-8111-111111111111",
};
const noFake = () => Promise.reject(new Error("no fake here"));
const open = RazorpayCheckout.open as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (initPaymentSheet as jest.Mock).mockResolvedValue({});
  (presentPaymentSheet as jest.Mock).mockResolvedValue({});
});

describe("presentSheet", () => {
  it("opens PaymentSheet with the API's params", async () => {
    await expect(presentSheet(stripeSheet("payment"), { onFake: noFake })).resolves.toBe(
      "completed",
    );
    expect(initStripe).toHaveBeenCalledWith({ publishableKey: "pk_test_X", urlScheme: "jarso" });
    expect(initPaymentSheet).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantDisplayName: "Jarso",
        customerId: "cus_1",
        customerEphemeralKeySecret: "ek_1",
        paymentIntentClientSecret: "pi_1_secret_x",
        returnURL: "jarso://stripe-redirect",
        allowsDelayedPaymentMethods: false,
      }),
    );
  });

  it("uses the setup intent secret for a setup sheet", async () => {
    await presentSheet(stripeSheet("setup"), { onFake: noFake });
    const params = (initPaymentSheet as jest.Mock).mock.calls[0][0];
    expect(params.setupIntentClientSecret).toBe("seti_1_secret_x");
    expect(params.paymentIntentClientSecret).toBeUndefined();
  });

  it("treats a Canceled sheet as closed", async () => {
    (presentPaymentSheet as jest.Mock).mockResolvedValue({
      error: { code: "Canceled", message: "The payment flow has been canceled" },
    });
    await expect(presentSheet(stripeSheet("payment"), { onFake: noFake })).resolves.toBe("closed");
  });

  it("treats a decline inside the sheet as closed, not failed", async () => {
    (presentPaymentSheet as jest.Mock).mockResolvedValue({
      error: { code: "Failed", message: "Your card was declined." },
    });
    await expect(presentSheet(stripeSheet("payment"), { onFake: noFake })).resolves.toBe("closed");
  });

  it("says the card form didn't load when PaymentSheet can't start", async () => {
    (initPaymentSheet as jest.Mock).mockResolvedValue({
      error: { code: "Failed", message: "No such payment_intent" },
    });
    await expect(presentSheet(stripeSheet("payment"), { onFake: noFake })).rejects.toMatchObject({
      code: "INTERNAL",
      message: paymentCopy.cardFormFailed,
    });
    expect(presentPaymentSheet).not.toHaveBeenCalled();
  });

  it("opens Razorpay card-only with the order id", async () => {
    open.mockResolvedValue({ razorpay_payment_id: "pay_1" });
    await expect(presentSheet(razorpaySheet("payment"), { onFake: noFake })).resolves.toBe(
      "completed",
    );
    const options = open.mock.calls[0][0];
    expect(options).toEqual(
      expect.objectContaining({
        key: "rzp_test_XXXXXXXX",
        order_id: "order_1",
        amount: 50_000,
        currency: "INR",
        name: "Jarso",
        description: "Allowance for Sam",
        method: expect.objectContaining({ card: true, upi: false, netbanking: false }),
      }),
    );
    expect(options.recurring).toBeUndefined();
    expect(options.customer_id).toBeUndefined();
  });

  it("adds recurring and prefill for a Razorpay setup", async () => {
    open.mockResolvedValue({ razorpay_payment_id: "pay_1" });
    await presentSheet(razorpaySheet("setup"), { onFake: noFake });
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: "cust_1",
        recurring: "1",
        prefill: { email: "parent@example.test", contact: "+910000000000" },
      }),
    );
  });

  it("treats a dismissed Razorpay checkout as closed", async () => {
    open.mockRejectedValue({ code: 2, description: "Payment cancelled by user" });
    await expect(presentSheet(razorpaySheet("payment"), { onFake: noFake })).resolves.toBe(
      "closed",
    );
  });

  it("hands a fake sheet to the dev dialog", async () => {
    const onFake = jest.fn(async (): Promise<SheetOutcome> => "completed");
    await expect(presentSheet(fakeSheet, { onFake })).resolves.toBe("completed");
    expect(onFake).toHaveBeenCalledWith(fakeSheet);
  });

  it("refuses a fake sheet outside dev builds", async () => {
    const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    try {
      const onFake = jest.fn();
      const error = await presentSheet(fakeSheet, { onFake }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: "INTERNAL", message: paymentCopy.cardFormFailed });
      expect(onFake).not.toHaveBeenCalled();
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
    }
  });
});
