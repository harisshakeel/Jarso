export type PaymentProviderId = "stripe" | "fake";
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
