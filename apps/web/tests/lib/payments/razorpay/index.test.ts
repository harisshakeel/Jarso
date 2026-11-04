// @vitest-environment node
import { createHmac } from "node:crypto";
import Razorpay from "razorpay";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRazorpayPaymentProvider } from "@/lib/payments/razorpay/index";
import customerCreated from "./fixtures/customer-created.json";
import duplicateReference from "./fixtures/error-duplicate-reference.json";
import orderCreated from "./fixtures/order-created.json";
import orderFetchedCharge from "./fixtures/order-fetched-charge.json";
import orderPaidSetup from "./fixtures/order-paid-setup.json";
import paymentCapturedCharge from "./fixtures/payment-captured-charge.json";
import paymentFailedCharge from "./fixtures/payment-failed-charge.json";
import paymentFetched from "./fixtures/payment-fetched.json";
import paymentLinkCreated from "./fixtures/payment-link-created.json";
import paymentLinkExpired from "./fixtures/payment-link-expired.json";
import paymentLinkPaid from "./fixtures/payment-link-paid.json";

const log = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));

const KEY_ID = "rzp_test_XXXXXXXXXXXXXX";
const KEY_SECRET = "test-key-secret";
const WEBHOOK_SECRET = "test-webhook-secret";
const UNAVAILABLE = {
  code: "UNAVAILABLE",
  message: "Card payments aren't available right now. You can still hand over cash.",
};

/** A 4xx/5xx as the SDK throws it (razorpay/dist/api.js normalizeError). */
const sdkError = (statusCode: number, error: Record<string, unknown>) => ({ statusCode, error });

function setup() {
  const client = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
  const createCustomer = vi.spyOn(client.customers, "create");
  const editCustomer = vi.spyOn(client.customers, "edit");
  const createLink = vi.spyOn(client.paymentLink, "create");
  const createOrder = vi.spyOn(client.orders, "create");
  const fetchOrder = vi.spyOn(client.orders, "fetch");
  const fetchPayment = vi.spyOn(client.payments, "fetch");
  const createRecurring = vi.spyOn(client.payments, "createRecurringPayment");
  const deleteToken = vi.spyOn(client.customers, "deleteToken");
  const provider = createRazorpayPaymentProvider({
    keyId: KEY_ID,
    keySecret: KEY_SECRET,
    webhookSecret: WEBHOOK_SECRET,
    checkoutUrl: "https://app.test/parent/payments/razorpay",
    client,
  });
  return {
    client,
    provider,
    createCustomer,
    editCustomer,
    createLink,
    createOrder,
    fetchOrder,
    fetchPayment,
    createRecurring,
    deleteToken,
  };
}

const paymentInput = {
  paymentId: "pay-9",
  amountMinor: 50000,
  currency: "INR",
  customerRef: "cust_TEST123",
  description: "Pocket money",
  successUrl: "https://app.test/ok",
  cancelUrl: "https://app.test/no",
  expiresAt: new Date("2026-11-01T10:31:00Z"),
};

beforeEach(() => {
  log.error.mockClear();
  log.warn.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("razorpay provider basics", () => {
  it("names itself and waits 72 hours for an auto charge to settle", () => {
    const { provider } = setup();
    expect(provider.id).toBe("razorpay");
    expect(provider.label).toBe("Razorpay");
    expect(provider.autoChargeSettleMinutes).toBe(4320);
  });

  it("needs the parent's email and phone to save a card", () => {
    expect(setup().provider.setupNeedsContact).toBe(true);
  });

  it("charges INR only", () => {
    const { provider } = setup();
    expect(provider.minimumChargeMinor("INR")).toBe(100);
    expect(provider.minimumChargeMinor("GBP")).toBeNull();
  });
});

describe("razorpay ensureCustomer", () => {
  it("creates or reuses a customer and returns its id", async () => {
    const { provider, createCustomer } = setup();
    createCustomer.mockResolvedValue(customerCreated as never);
    const result = await provider.ensureCustomer({
      parentId: "parent-1",
      email: "parent@example.com",
    });

    expect(result).toEqual({ customerRef: "cust_TEST123" });
    expect(createCustomer).toHaveBeenCalledTimes(1);
    expect(createCustomer.mock.calls[0]).toEqual([
      {
        name: "Jarso parent",
        email: "parent@example.com",
        // A string: Razorpay ignores the number 0 and refuses an existing customer.
        fail_existing: "0",
        notes: { parentId: "parent-1" },
      },
    ]);
  });

  it("leaves the email out when the parent has none", async () => {
    const { provider, createCustomer } = setup();
    createCustomer.mockResolvedValue(customerCreated as never);
    await provider.ensureCustomer({ parentId: "parent-1", email: null });
    expect(createCustomer.mock.calls[0]?.[0]).not.toHaveProperty("email");
  });

  it("turns a 4xx into UNAVAILABLE, logging only Razorpay's code and reason", async () => {
    const { provider, createCustomer } = setup();
    createCustomer.mockRejectedValue(
      sdkError(400, {
        code: "BAD_REQUEST_ERROR",
        description: "The email parent@example.com is invalid",
        reason: "input_validation_failed",
        field: "email",
      }),
    );
    await expect(
      provider.ensureCustomer({ parentId: "parent-1", email: "parent@example.com" }),
    ).rejects.toMatchObject(UNAVAILABLE);
    expect(log.error).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(log.error.mock.calls[0]);
    expect(logged).toContain("BAD_REQUEST_ERROR");
    expect(logged).toContain("input_validation_failed");
    expect(logged).not.toContain("parent@example.com");
    expect(logged).not.toContain(KEY_SECRET);
  });
});

describe("razorpay createHostedPayment", () => {
  it("creates a card-only payment link and returns its short url", async () => {
    const { provider, createLink } = setup();
    createLink.mockResolvedValue(paymentLinkCreated as never);
    const result = await provider.createHostedPayment(paymentInput);

    expect(result).toEqual({
      redirectUrl: "https://rzp.io/i/TEST123",
      providerRef: "plink_TEST123",
    });
    expect(createLink).toHaveBeenCalledTimes(1);
    expect(createLink.mock.calls[0]).toEqual([
      {
        amount: 50000,
        currency: "INR",
        accept_partial: false,
        description: "Pocket money",
        reference_id: "pay-9",
        expire_by: Math.floor(paymentInput.expiresAt.getTime() / 1000),
        notify: { sms: false, email: false },
        reminder_enable: false,
        callback_url: "https://app.test/ok",
        callback_method: "get",
        options: {
          checkout: {
            method: {
              card: true,
              netbanking: false,
              upi: false,
              wallet: false,
              emi: false,
              paylater: false,
            },
          },
        },
      },
    ]);
  });

  it("treats a duplicate reference id as UNAVAILABLE", async () => {
    const { provider, createLink } = setup();
    createLink.mockRejectedValue(sdkError(400, duplicateReference.error));
    await expect(provider.createHostedPayment(paymentInput)).rejects.toMatchObject(UNAVAILABLE);
  });

  it("treats a 5xx as UNAVAILABLE", async () => {
    const { provider, createLink } = setup();
    createLink.mockRejectedValue(
      sdkError(500, { code: "SERVER_ERROR", description: "We are facing some trouble" }),
    );
    await expect(provider.createHostedPayment(paymentInput)).rejects.toMatchObject(UNAVAILABLE);
  });

  it("treats a network failure as UNAVAILABLE", async () => {
    const { provider, createLink } = setup();
    // What the SDK throws when axios has no response: it reads err.response.status.
    createLink.mockRejectedValue(
      new TypeError("Cannot read properties of undefined (reading 'status')"),
    );
    await expect(provider.createHostedPayment(paymentInput)).rejects.toMatchObject(UNAVAILABLE);
  });

  it("gives up after 8 seconds as UNAVAILABLE", async () => {
    vi.useFakeTimers();
    const { provider, createLink } = setup();
    createLink.mockReturnValue(new Promise(() => {}) as never);
    const result = provider.createHostedPayment(paymentInput);
    const settled = expect(result).rejects.toMatchObject(UNAVAILABLE);
    await vi.advanceTimersByTimeAsync(7999);
    expect(log.error).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await settled;
    expect(JSON.stringify(log.error.mock.calls[0])).toContain("timeout");
  });

  it("treats a success without a short url as UNAVAILABLE", async () => {
    const { provider, createLink } = setup();
    createLink.mockResolvedValue({ id: "plink_TEST123" } as never);
    await expect(provider.createHostedPayment(paymentInput)).rejects.toMatchObject(UNAVAILABLE);
  });
});

describe("razorpay createHostedSetup", () => {
  const PHONE = "+919000000000";
  const EMAIL = "parent@example.com";
  const setupInput = {
    setupId: "set-1",
    // Jarso's stored customer, which may have no phone: the order uses the contact customer.
    customerRef: "cust_STORED1",
    successUrl: "https://app.test/parent/settings?card=saved",
    cancelUrl: "https://app.test/parent/settings?card=cancelled",
    contact: { email: EMAIL, phone: PHONE },
  };
  const VALIDATION = { code: "VALIDATION" };
  /** The customer Razorpay finds or creates for the parent's email and phone. */
  const contactCustomer = { ...customerCreated, id: "cust_CONTACT1", contact: PHONE };

  /** Every logger call so far, as one string, to check the phone and email never reach it. */
  const logged = () =>
    JSON.stringify([log.error.mock.calls, log.warn.mock.calls, log.info.mock.calls]);

  it("creates a card token order and sends the parent to Jarso's save-card page", async () => {
    const { provider, createOrder, createCustomer } = setup();
    createCustomer.mockResolvedValue(contactCustomer as never);
    createOrder.mockResolvedValue(orderCreated as never);
    const result = await provider.createHostedSetup(setupInput);

    expect(createOrder.mock.calls[0]).toEqual([
      {
        amount: 100,
        currency: "INR",
        customer_id: "cust_CONTACT1",
        method: "card",
        payment_capture: true,
        receipt: "set-1",
        notes: { jarsoSetup: "set-1" },
        token: { max_amount: 1500000, frequency: "as_presented" },
      },
    ]);
    expect(result.providerRef).toBe("order_TESTSETUP1");
    const url = new URL(result.redirectUrl);
    expect(`${url.origin}${url.pathname}`).toBe("https://app.test/parent/payments/razorpay");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      order: "order_TESTSETUP1",
      customer: "cust_CONTACT1",
      success: setupInput.successUrl,
      cancel: setupInput.cancelUrl,
    });
    // Each value is encoded, so the return URLs' own query can't leak into the page's.
    expect(result.redirectUrl).toContain(
      "success=https%3A%2F%2Fapp.test%2Fparent%2Fsettings%3Fcard%3Dsaved",
    );
    // The phone and email go to Razorpay only: never into Jarso's URL.
    expect(result.redirectUrl).not.toContain("9000000000");
    expect(result.redirectUrl).not.toContain("example.com");
  });

  it("finds or creates the customer with the parent's email and phone before the order", async () => {
    const { provider, createOrder, createCustomer, editCustomer } = setup();
    createCustomer.mockResolvedValue(contactCustomer as never);
    createOrder.mockResolvedValue(orderCreated as never);
    await provider.createHostedSetup(setupInput);

    // fail_existing must be the string "0": Razorpay ignores the number and refuses a repeat.
    expect(createCustomer.mock.calls).toEqual([
      [{ name: "Jarso parent", email: EMAIL, contact: PHONE, fail_existing: "0" }],
    ]);
    expect(createCustomer.mock.invocationCallOrder[0]).toBeLessThan(
      createOrder.mock.invocationCallOrder[0] as number,
    );
    // Editing would fail when another customer already has this email and phone.
    expect(editCustomer).not.toHaveBeenCalled();
  });

  it("treats a customer without an id as UNAVAILABLE", async () => {
    const { provider, createOrder, createCustomer } = setup();
    createCustomer.mockResolvedValue({} as never);
    await expect(provider.createHostedSetup(setupInput)).rejects.toMatchObject(UNAVAILABLE);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("refuses to save a card without the parent's email and phone", async () => {
    const { provider, createOrder, createCustomer, editCustomer } = setup();
    const { contact: _contact, ...withoutContact } = setupInput;
    await expect(provider.createHostedSetup(withoutContact)).rejects.toMatchObject(VALIDATION);
    expect(createCustomer).not.toHaveBeenCalled();
    expect(editCustomer).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
  });

  it.each([
    ["contact", "phone"],
    ["email", "email"],
  ])("turns a 400 on the customer's %s into a VALIDATION on %s", async (field, key) => {
    const { provider, createOrder, createCustomer } = setup();
    createCustomer.mockRejectedValue(
      sdkError(400, {
        code: "BAD_REQUEST_ERROR",
        description: `The ${field} ${PHONE} ${EMAIL} is invalid.`,
        reason: "input_validation_failed",
        field,
      }),
    );
    const error = await provider.createHostedSetup(setupInput).catch((e: unknown) => e);
    expect(error).toMatchObject(VALIDATION);
    const fieldErrors = (error as { fieldErrors?: Record<string, string[]> }).fieldErrors;
    expect(Object.keys(fieldErrors ?? {})).toEqual([key]);
    expect(fieldErrors?.[key]?.[0]).toMatch(/\S/);
    expect(createOrder).not.toHaveBeenCalled();
    expect(logged()).not.toContain("9000000000");
    expect(logged()).not.toContain(EMAIL);
  });

  it.each([
    ["a 5xx", sdkError(500, { code: "SERVER_ERROR" })],
    [
      "an unexpected 'already exists'",
      sdkError(400, {
        code: "BAD_REQUEST_ERROR",
        description: "Customer already exists for the merchant",
        reason: "input_validation_failed",
      }),
    ],
  ])("treats %s on the customer as UNAVAILABLE", async (_name, cause) => {
    const { provider, createOrder, createCustomer } = setup();
    createCustomer.mockRejectedValue(cause);
    await expect(provider.createHostedSetup(setupInput)).rejects.toMatchObject(UNAVAILABLE);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("treats a 4xx on the order as UNAVAILABLE", async () => {
    const { provider, createOrder, createCustomer } = setup();
    createCustomer.mockResolvedValue(contactCustomer as never);
    createOrder.mockRejectedValue(
      sdkError(400, { code: "BAD_REQUEST_ERROR", reason: "input_validation_failed" }),
    );
    await expect(provider.createHostedSetup(setupInput)).rejects.toMatchObject(UNAVAILABLE);
  });

  it("treats an order without an id as UNAVAILABLE", async () => {
    const { provider, createOrder, createCustomer } = setup();
    createCustomer.mockResolvedValue(contactCustomer as never);
    createOrder.mockResolvedValue({} as never);
    await expect(provider.createHostedSetup(setupInput)).rejects.toMatchObject(UNAVAILABLE);
  });
});

describe("razorpay chargeSaved", () => {
  const chargeInput = {
    paymentId: "pay-9",
    amountMinor: 50000,
    currency: "inr",
    customerRef: "cust_TEST123",
    methodRef: "cust_TEST123:token_TEST123:pay_TESTAUTH1",
    description: "Allowance for Sam",
  };
  const chargeOrder = { ...orderCreated, id: "order_TESTCHARGE1", amount: 50000 };

  function charging() {
    const s = setup();
    s.fetchPayment.mockResolvedValue(paymentFetched as never);
    s.createOrder.mockResolvedValue(chargeOrder as never);
    s.createRecurring.mockResolvedValue({ razorpay_payment_id: "pay_TESTCHARGE1" } as never);
    return s;
  }

  it("reads the card's contact details, creates an order and starts a recurring payment", async () => {
    const { provider, fetchPayment, createOrder, createRecurring } = charging();
    const result = await provider.chargeSaved(chargeInput);

    expect(result).toEqual({ providerRef: "order_TESTCHARGE1", status: "pending" });
    expect(fetchPayment.mock.calls[0]).toEqual(["pay_TESTAUTH1"]);
    expect(createOrder.mock.calls[0]).toEqual([
      {
        amount: 50000,
        currency: "INR",
        payment_capture: true,
        receipt: "pay-9",
        notes: { jarsoCharge: "pay-9" },
      },
    ]);
    expect(createRecurring.mock.calls[0]).toEqual([
      {
        email: "parent@example.com",
        contact: "9999999999",
        amount: 50000,
        currency: "INR",
        order_id: "order_TESTCHARGE1",
        customer_id: "cust_TEST123",
        token: "token_TEST123",
        recurring: true,
        description: "Allowance for Sam",
        notes: { jarsoCharge: "pay-9" },
      },
    ]);
  });

  it("charges the customer the card was saved under, which is usually not Jarso's stored one", async () => {
    const { provider, createRecurring } = charging();
    await provider.chargeSaved({ ...chargeInput, customerRef: "cust_OTHER1" });
    expect(createRecurring.mock.calls[0]?.[0]).toMatchObject({ customer_id: "cust_TEST123" });
    // Expected since the save-card customer is found by email and phone: not worth a warning.
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("reports a declined recurring payment as failed with the mapped reason", async () => {
    const { provider, createRecurring } = charging();
    createRecurring.mockRejectedValue(
      sdkError(400, {
        code: "BAD_REQUEST_ERROR",
        description: "Payment declined by the bank",
        reason: "card_declined",
      }),
    );
    expect(await provider.chargeSaved(chargeInput)).toEqual({
      providerRef: "order_TESTCHARGE1",
      status: "failed",
      failureCode: "declined",
    });
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("parent@example.com");
  });

  it("maps an unknown recurring failure reason to other", async () => {
    const { provider, createRecurring } = charging();
    createRecurring.mockRejectedValue(sdkError(400, { code: "BAD_REQUEST_ERROR" }));
    expect(await provider.chargeSaved(chargeInput)).toMatchObject({
      status: "failed",
      failureCode: "other",
    });
  });

  it("logs Razorpay's description when the account refuses the charge", async () => {
    const { provider, createRecurring } = charging();
    // What Razorpay answers when recurring payments on cards aren't enabled for the account.
    createRecurring.mockRejectedValue(
      sdkError(400, {
        code: "BAD_REQUEST_ERROR",
        description: "The requested URL was not found on the server.",
        source: "internal",
        reason: "NA",
      }),
    );
    expect(await provider.chargeSaved(chargeInput)).toMatchObject({ status: "failed" });
    expect(log.warn).toHaveBeenCalledWith(
      "razorpay recurring payment refused",
      expect.objectContaining({
        source: "internal",
        description: "The requested URL was not found on the server.",
      }),
    );
  });

  it("logs the source but not the description of a customer or card error", async () => {
    const { provider, createRecurring } = charging();
    createRecurring.mockRejectedValue(
      sdkError(400, {
        code: "BAD_REQUEST_ERROR",
        description: "Payment declined by the bank",
        source: "issuer_bank",
        reason: "card_declined",
      }),
    );
    await provider.chargeSaved(chargeInput);
    const fields = log.warn.mock.calls[0]?.[1];
    expect(fields).toMatchObject({ source: "issuer_bank" });
    expect(fields).not.toHaveProperty("description");
  });

  it.each([
    ["an email", "Customer parent@example.com is blocked"],
    ["a long number", "Contact 9999999999 is not allowed"],
  ])("drops an account-level description that echoes %s", async (_, description) => {
    const { provider, createRecurring } = charging();
    createRecurring.mockRejectedValue(
      sdkError(400, { code: "BAD_REQUEST_ERROR", description, source: "business" }),
    );
    await provider.chargeSaved(chargeInput);
    const fields = log.warn.mock.calls[0]?.[1];
    expect(fields).toMatchObject({ source: "business" });
    expect(fields).not.toHaveProperty("description");
  });

  it("logs an account-level description on an outage too", async () => {
    const { provider, createOrder } = charging();
    createOrder.mockRejectedValue(
      sdkError(400, {
        code: "BAD_REQUEST_ERROR",
        description: "Recurring is not enabled for this merchant",
        source: "business",
      }),
    );
    await expect(provider.chargeSaved(chargeInput)).rejects.toMatchObject(UNAVAILABLE);
    expect(log.error).toHaveBeenCalledWith(
      "razorpay call failed",
      expect.objectContaining({ description: "Recurring is not enabled for this merchant" }),
    );
  });

  it("treats a 5xx from the recurring payment as UNAVAILABLE", async () => {
    const { provider, createRecurring } = charging();
    createRecurring.mockRejectedValue(sdkError(502, { code: "SERVER_ERROR" }));
    await expect(provider.chargeSaved(chargeInput)).rejects.toMatchObject(UNAVAILABLE);
  });

  it("treats a network failure on the recurring payment as UNAVAILABLE", async () => {
    const { provider, createRecurring } = charging();
    createRecurring.mockRejectedValue(new TypeError("Cannot read properties of undefined"));
    await expect(provider.chargeSaved(chargeInput)).rejects.toMatchObject(UNAVAILABLE);
  });

  it("treats a 4xx from the payment fetch as UNAVAILABLE without charging", async () => {
    const { provider, fetchPayment, createOrder, createRecurring } = charging();
    fetchPayment.mockRejectedValue(
      sdkError(400, { code: "BAD_REQUEST_ERROR", reason: "input_validation_failed" }),
    );
    await expect(provider.chargeSaved(chargeInput)).rejects.toMatchObject(UNAVAILABLE);
    expect(createOrder).not.toHaveBeenCalled();
    expect(createRecurring).not.toHaveBeenCalled();
  });

  it("treats a 4xx from the order as UNAVAILABLE without charging", async () => {
    const { provider, createOrder, createRecurring } = charging();
    createOrder.mockRejectedValue(
      sdkError(400, { code: "BAD_REQUEST_ERROR", description: "Duplicate request" }),
    );
    await expect(provider.chargeSaved(chargeInput)).rejects.toMatchObject(UNAVAILABLE);
    expect(createRecurring).not.toHaveBeenCalled();
  });

  it("treats a saved card without an email or contact as UNAVAILABLE", async () => {
    const { provider, fetchPayment, createRecurring } = charging();
    fetchPayment.mockResolvedValue({ ...paymentFetched, contact: undefined } as never);
    await expect(provider.chargeSaved(chargeInput)).rejects.toMatchObject(UNAVAILABLE);
    expect(createRecurring).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "cust_TEST123",
    "cust_TEST123:token_TEST123",
    "cust_TEST123::pay_TESTAUTH1",
    "cust_TEST123:token_TEST123:pay_TESTAUTH1:extra",
  ])("treats a malformed card reference as UNAVAILABLE: %j", async (methodRef) => {
    const { provider, fetchPayment } = charging();
    await expect(provider.chargeSaved({ ...chargeInput, methodRef })).rejects.toMatchObject(
      UNAVAILABLE,
    );
    expect(fetchPayment).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});

describe("razorpay in-app payments", () => {
  const inAppInput = {
    paymentId: "pay-1",
    amountMinor: 50000,
    currency: "INR",
    customerRef: "cust_TEST123",
    description: "Allowance for Sam",
    expiresAt: new Date("2026-11-03T10:31:00Z"),
  };

  it("has a native sheet", () => {
    expect(setup().provider.inApp).toBe(true);
  });

  it("creates an order tagged jarsoPay and returns Checkout's params", async () => {
    const { provider, createOrder } = setup();
    createOrder.mockResolvedValue({ id: "order_TESTPAY1" } as never);
    expect(await provider.createInAppPayment(inAppInput)).toEqual({
      providerRef: "order_TESTPAY1",
      sheet: {
        provider: "razorpay",
        mode: "payment",
        keyId: KEY_ID,
        orderId: "order_TESTPAY1",
        amountMinor: 50000,
        currency: "INR",
        description: "Allowance for Sam",
      },
    });
    expect(createOrder.mock.calls).toEqual([
      [
        {
          amount: 50000,
          currency: "INR",
          payment_capture: true,
          receipt: "pay-1",
          notes: { jarsoPay: "pay-1" },
        },
      ],
    ]);
  });

  it("treats an order without an id as UNAVAILABLE", async () => {
    const { provider, createOrder } = setup();
    createOrder.mockResolvedValue({} as never);
    await expect(provider.createInAppPayment(inAppInput)).rejects.toMatchObject(UNAVAILABLE);
  });

  it("resumes from the stored order id without calling Razorpay", async () => {
    const { provider, createOrder, fetchOrder, createCustomer } = setup();
    expect(
      await provider.resumeInAppPayment({
        paymentId: "pay-1",
        providerRef: "order_TESTPAY1",
        customerRef: "cust_TEST123",
        amountMinor: 50000,
        currency: "INR",
        description: "Allowance for Sam",
      }),
    ).toEqual({
      provider: "razorpay",
      mode: "payment",
      keyId: KEY_ID,
      orderId: "order_TESTPAY1",
      amountMinor: 50000,
      currency: "INR",
      description: "Allowance for Sam",
    });
    expect(createOrder).not.toHaveBeenCalled();
    expect(fetchOrder).not.toHaveBeenCalled();
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it("can't cancel an order, so cancelling is a no-op", async () => {
    const { provider, fetchOrder } = setup();
    await expect(provider.cancelInAppPayment("order_TESTPAY1")).resolves.toBeUndefined();
    expect(fetchOrder).not.toHaveBeenCalled();
  });
});

describe("razorpay createInAppSetup", () => {
  const PHONE = "+919000000000";
  const EMAIL = "parent@example.com";
  const contactCustomer = { ...customerCreated, id: "cust_CONTACT1", contact: PHONE };

  it("refuses to save a card without the parent's email and phone", async () => {
    const { provider, createOrder, createCustomer } = setup();
    const error = await provider
      .createInAppSetup({ setupId: "set-1", customerRef: "cust_STORED1" })
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({ code: "VALIDATION" });
    expect((error as { fieldErrors?: unknown }).fieldErrors).toHaveProperty("phone");
    expect(createCustomer).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("creates the same card token order as the hosted setup and prefills Checkout", async () => {
    const { provider, createOrder, createCustomer } = setup();
    createCustomer.mockResolvedValue(contactCustomer as never);
    createOrder.mockResolvedValue(orderCreated as never);
    const result = await provider.createInAppSetup({
      setupId: "set-1",
      customerRef: "cust_STORED1",
      contact: { email: EMAIL, phone: PHONE },
    });
    expect(createOrder.mock.calls).toEqual([
      [
        {
          amount: 100,
          currency: "INR",
          customer_id: "cust_CONTACT1",
          method: "card",
          payment_capture: true,
          receipt: "set-1",
          notes: { jarsoSetup: "set-1" },
          token: { max_amount: 1500000, frequency: "as_presented" },
        },
      ],
    ]);
    expect(result).toEqual({
      providerRef: "order_TESTSETUP1",
      sheet: {
        provider: "razorpay",
        mode: "setup",
        keyId: KEY_ID,
        orderId: "order_TESTSETUP1",
        amountMinor: 100,
        currency: "INR",
        description: "Save a card",
        customerId: "cust_CONTACT1",
        prefill: { email: EMAIL, contact: PHONE },
      },
    });
    const logged = JSON.stringify([log.error.mock.calls, log.warn.mock.calls, log.info.mock.calls]);
    expect(logged).not.toContain("9000000000");
    expect(logged).not.toContain(EMAIL);
  });
});

describe("razorpay detachMethod", () => {
  it("deletes the card token from the customer", async () => {
    const { provider, deleteToken } = setup();
    deleteToken.mockResolvedValue({ deleted: true } as never);
    await provider.detachMethod("cust_TEST123:token_TEST123:pay_TESTAUTH1");
    expect(deleteToken.mock.calls[0]).toEqual(["cust_TEST123", "token_TEST123"]);
  });

  it("treats a token that no longer exists as removed", async () => {
    const { provider, deleteToken } = setup();
    deleteToken.mockRejectedValue(
      sdkError(400, {
        code: "BAD_REQUEST_ERROR",
        description: "The id provided does not exist",
        reason: "input_validation_failed",
      }),
    );
    await expect(provider.detachMethod("cust_TEST123:token_TEST123:pay_TESTAUTH1")).resolves.toBe(
      undefined,
    );
  });

  it("treats another 4xx as UNAVAILABLE", async () => {
    const { provider, deleteToken } = setup();
    deleteToken.mockRejectedValue(
      sdkError(400, { code: "BAD_REQUEST_ERROR", description: "Something else" }),
    );
    await expect(
      provider.detachMethod("cust_TEST123:token_TEST123:pay_TESTAUTH1"),
    ).rejects.toMatchObject(UNAVAILABLE);
  });

  it("treats a malformed card reference as UNAVAILABLE", async () => {
    const { provider, deleteToken } = setup();
    await expect(provider.detachMethod("not-a-ref")).rejects.toMatchObject(UNAVAILABLE);
    expect(deleteToken).not.toHaveBeenCalled();
  });
});

describe("razorpay parseWebhook", () => {
  const sign = (body: string, secret = WEBHOOK_SECRET) =>
    createHmac("sha256", secret).update(body).digest("hex");
  const headersFor = (body: string, extra: Record<string, string> = {}) =>
    new Headers({
      "x-razorpay-signature": sign(body),
      "x-razorpay-event-id": "evt_TEST123",
      ...extra,
    });

  it("maps a correctly signed event, using the event id header", async () => {
    const { provider } = setup();
    const body = JSON.stringify(paymentLinkPaid);
    expect(await provider.parseWebhook(body, headersFor(body))).toEqual({
      kind: "payment",
      eventId: "evt_TEST123",
      paymentId: "pay-1",
      providerRef: "plink_TEST123",
      status: "succeeded",
    });
  });

  it("rejects a signature made with another secret", async () => {
    const { provider } = setup();
    const body = JSON.stringify(paymentLinkPaid);
    const headers = headersFor(body, { "x-razorpay-signature": sign(body, "other-secret") });
    await expect(provider.parseWebhook(body, headers)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rejects a tampered body", async () => {
    const { provider } = setup();
    const body = JSON.stringify(paymentLinkPaid);
    await expect(provider.parseWebhook(`${body} `, headersFor(body))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rejects a signature of the wrong length", async () => {
    const { provider } = setup();
    const body = JSON.stringify(paymentLinkPaid);
    const headers = headersFor(body, { "x-razorpay-signature": "abc" });
    await expect(provider.parseWebhook(body, headers)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rejects a missing signature", async () => {
    const { provider } = setup();
    const body = JSON.stringify(paymentLinkPaid);
    const headers = new Headers({ "x-razorpay-event-id": "evt_TEST123" });
    await expect(provider.parseWebhook(body, headers)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rejects a missing event id", async () => {
    const { provider } = setup();
    const body = JSON.stringify(paymentLinkPaid);
    const headers = new Headers({ "x-razorpay-signature": sign(body) });
    await expect(provider.parseWebhook(body, headers)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rejects a signed body that is not JSON", async () => {
    const { provider } = setup();
    const body = "not json";
    await expect(provider.parseWebhook(body, headersFor(body))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rejects a live-mode event", async () => {
    const { provider } = setup();
    const event = structuredClone(paymentLinkPaid);
    event.payload.order.entity.public_key = "rzp_live_XXXXXXXXXXXXXX";
    const body = JSON.stringify(event);
    await expect(provider.parseWebhook(body, headersFor(body))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("maps an expired link without an order", async () => {
    const { provider } = setup();
    const body = JSON.stringify(paymentLinkExpired);
    expect(await provider.parseWebhook(body, headersFor(body))).toMatchObject({
      kind: "payment",
      status: "expired",
    });
  });

  it("maps a saved card without fetching when the event names the card", async () => {
    const { provider, fetchPayment } = setup();
    const body = JSON.stringify(orderPaidSetup);
    expect(await provider.parseWebhook(body, headersFor(body))).toMatchObject({
      kind: "setup",
      card: { brand: "visa", last4: "1111" },
    });
    expect(fetchPayment).not.toHaveBeenCalled();
  });

  it("fetches the card when a saved-card event leaves it out", async () => {
    const { provider, fetchPayment } = setup();
    fetchPayment.mockResolvedValue({
      ...paymentFetched,
      card: { ...paymentFetched.card, network: "MasterCard", last4: "4444" },
    } as never);
    const event = structuredClone(orderPaidSetup);
    delete (event.payload.payment.entity as Partial<typeof event.payload.payment.entity>).card;
    const body = JSON.stringify(event);

    expect(await provider.parseWebhook(body, headersFor(body))).toEqual({
      kind: "setup",
      eventId: "evt_TEST123",
      setupId: "set-1",
      methodRef: "cust_TEST123:token_TEST123:pay_TESTAUTH1",
      card: { brand: "mastercard", last4: "4444" },
    });
    expect(fetchPayment.mock.calls[0]).toEqual(["pay_TESTAUTH1", { "expand[]": "card" }]);
  });

  it("lets the provider retry when the card fetch fails", async () => {
    const { provider, fetchPayment } = setup();
    fetchPayment.mockRejectedValue(sdkError(503, { code: "SERVER_ERROR" }));
    const event = structuredClone(orderPaidSetup);
    delete (event.payload.payment.entity as Partial<typeof event.payload.payment.entity>).card;
    const body = JSON.stringify(event);
    await expect(provider.parseWebhook(body, headersFor(body))).rejects.toMatchObject(UNAVAILABLE);
  });

  it("settles a failed auto charge named by its fetched order's notes", async () => {
    const { provider, fetchOrder } = setup();
    fetchOrder.mockResolvedValue(orderFetchedCharge as never);
    const body = JSON.stringify(paymentFailedCharge);
    expect(await provider.parseWebhook(body, headersFor(body))).toEqual({
      kind: "payment",
      eventId: "evt_TEST123",
      paymentId: "pay-9",
      providerRef: "order_TESTCHARGE1",
      status: "failed",
      failureCode: "declined",
    });
    expect(fetchOrder.mock.calls).toEqual([["order_TESTCHARGE1"]]);
  });

  it("ignores a failed payment whose notes name a payment its order does not", async () => {
    const { provider, fetchOrder } = setup();
    // A browser-set note on a Payment Link or save-card attempt: the order has no jarsoCharge.
    fetchOrder.mockResolvedValue({ ...orderCreated, id: "order_TESTCHARGE1" } as never);
    const body = JSON.stringify(paymentFailedCharge);
    expect(await provider.parseWebhook(body, headersFor(body))).toBeNull();
  });

  it("lets the provider retry when the order fetch fails", async () => {
    const { provider, fetchOrder } = setup();
    fetchOrder.mockRejectedValue(sdkError(503, { code: "SERVER_ERROR" }));
    const body = JSON.stringify(paymentFailedCharge);
    await expect(provider.parseWebhook(body, headersFor(body))).rejects.toMatchObject(UNAVAILABLE);
    expect(log.error.mock.calls[0]?.[1]).toEqual({
      op: "orders.fetch",
      status: 503,
      code: "SERVER_ERROR",
      reason: undefined,
    });
  });

  it("ignores payment.captured, even with a jarsoCharge payment note", async () => {
    const { provider, fetchOrder } = setup();
    fetchOrder.mockResolvedValue(orderFetchedCharge as never);
    const body = JSON.stringify(paymentCapturedCharge);
    expect(await provider.parseWebhook(body, headersFor(body))).toBeNull();
    expect(fetchOrder).not.toHaveBeenCalled();
  });

  it("returns null for an event it does not act on", async () => {
    const { provider } = setup();
    const body = JSON.stringify({ ...paymentLinkExpired, event: "refund.processed" });
    expect(await provider.parseWebhook(body, headersFor(body))).toBeNull();
  });
});
