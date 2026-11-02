/** Every provider Jarso knows, in display order. The database's provider checks match this list. */
export const PAYMENT_PROVIDER_IDS = ["stripe", "razorpay", "fake"] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDER_IDS)[number];

export function isPaymentProviderId(value: string): value is PaymentProviderId {
  return (PAYMENT_PROVIDER_IDS as readonly string[]).includes(value);
}

export type PaymentStatus =
  | "pending"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "canceled"
  | "expired";
export type FailureCode =
  | "declined"
  | "insufficient_funds"
  | "authentication_required"
  | "expired_card"
  | "other";
export type CardSummary = { brand: string; last4: string };

export type ProviderEvent =
  | {
      kind: "payment";
      eventId: string;
      paymentId: string;
      providerRef: string;
      status: PaymentStatus;
      failureCode?: FailureCode;
    }
  | { kind: "setup"; eventId: string; setupId: string; methodRef: string; card: CardSummary }
  | { kind: "setup_failed"; eventId: string; setupId: string; reason: "expired" | "failed" };

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  /** Name shown to the parent when more than one provider is on ("Pay with Stripe"). */
  readonly label: string;
  /**
   * How long an off-session (auto) charge may stay pending before the stale sweep expires it.
   * Stripe settles in seconds; a provider that must notify the cardholder before debiting needs
   * longer, or a charge still on its way would be reported as failed.
   */
  readonly autoChargeSettleMinutes: number;
  /**
   * Saving a card needs the parent's email and phone (Razorpay refuses a recurring card token
   * otherwise). The caller asks the parent and passes them as `createHostedSetup`'s `contact`;
   * Jarso never stores either.
   */
  readonly setupNeedsContact: boolean;
  /** Smallest amount the provider will charge, in minor units. Null when the currency is unsupported. */
  minimumChargeMinor(currency: string): number | null;
  ensureCustomer(i: { parentId: string; email: string | null }): Promise<{ customerRef: string }>;
  createHostedPayment(i: {
    paymentId: string;
    amountMinor: number;
    currency: string;
    customerRef: string;
    description: string;
    successUrl: string;
    cancelUrl: string;
    expiresAt: Date;
  }): Promise<{ redirectUrl: string; providerRef: string }>;
  createHostedSetup(i: {
    setupId: string;
    customerRef: string;
    successUrl: string;
    cancelUrl: string;
    /** Required when `setupNeedsContact`, ignored otherwise. Sent to the provider, never kept. */
    contact?: { email: string; phone: string };
  }): Promise<{ redirectUrl: string; providerRef: string }>;
  chargeSaved(i: {
    paymentId: string;
    amountMinor: number;
    currency: string;
    customerRef: string;
    methodRef: string;
    description: string;
  }): Promise<{ providerRef: string; status: PaymentStatus; failureCode?: FailureCode }>;
  detachMethod(methodRef: string): Promise<void>;
  /** Verifies the signature and maps the event. Throws VALIDATION on a bad signature. Null: ignore. */
  parseWebhook(rawBody: string, headers: Headers): Promise<ProviderEvent | null>;
}
