import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardPaymentState } from "@/features/payments";
import { PayByCard } from "@/features/payments/components/pay-by-card";

const startCardPaymentAction = vi.hoisted(() => vi.fn());
vi.mock("@/features/payments/server/actions", () => ({ startCardPaymentAction }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const fake = { id: "fake" as const, label: "Test card" };
const ready: CardPaymentState = {
  providers: [{ ...fake, available: true, unavailableReason: null }],
  pending: null,
  lastOutcome: null,
};

function renderPay(state: Partial<CardPaymentState> = {}, split = { cash: 300, saved: 200 }) {
  render(
    <PayByCard
      childId="child-1"
      kind="allowance"
      id="00000000-0000-4000-8000-000000000001"
      amountMinor={500}
      currency="GBP"
      split={split}
      state={{ ...ready, ...state }}
    />,
  );
}

describe("PayByCard", () => {
  it("offers a row named after the provider when a card can pay", () => {
    renderPay();
    expect(screen.getByRole("button", { name: "Pay with Test card" })).toBeEnabled();
  });

  it("starts a card payment for the full amount with the split", async () => {
    startCardPaymentAction.mockResolvedValue({ ok: true, data: undefined });
    renderPay();
    fireEvent.click(screen.getByRole("button", { name: "Pay with Test card" }));
    await waitFor(() =>
      expect(startCardPaymentAction).toHaveBeenCalledWith(null, {
        kind: "allowance",
        id: "00000000-0000-4000-8000-000000000001",
        provider: "fake",
        cash: "3.00",
        saved: "2.00",
      }),
    );
  });

  it("shows a failed start as an error", async () => {
    startCardPaymentAction.mockResolvedValue({
      ok: false,
      error: { code: "UNAVAILABLE", message: "Card payments aren't available right now." },
    });
    renderPay();
    fireEvent.click(screen.getByRole("button", { name: "Pay with Test card" }));
    expect(await screen.findByText("Card payments aren't available right now.")).toBeVisible();
  });

  it("is disabled with a reason when the amount is too small", () => {
    renderPay({ providers: [{ ...fake, available: false, unavailableReason: "too_small" }] });
    expect(screen.getByRole("button", { name: "Pay by card" })).toBeDisabled();
    expect(screen.getByText("Too small to pay by card")).toBeInTheDocument();
  });

  const stripe = { id: "stripe" as const, label: "Stripe" };
  const razorpay = { id: "razorpay" as const, label: "Razorpay" };

  it("offers one row per provider that can pay, named after it", async () => {
    startCardPaymentAction.mockResolvedValue({ ok: true, data: undefined });
    renderPay({
      providers: [
        { ...stripe, available: true, unavailableReason: null },
        { ...fake, available: true, unavailableReason: null },
      ],
    });
    expect(screen.queryByRole("button", { name: "Pay by card" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay with Stripe" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Pay with Test card" }));
    await waitFor(() =>
      expect(startCardPaymentAction).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ provider: "fake" }),
      ),
    );
  });

  it("hides a provider that can't charge the family's currency", async () => {
    startCardPaymentAction.mockResolvedValue({ ok: true, data: undefined });
    renderPay({
      providers: [
        { ...razorpay, available: false, unavailableReason: "unsupported_currency" },
        { ...fake, available: true, unavailableReason: null },
      ],
    });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Pay with Test card" }));
    await waitFor(() =>
      expect(startCardPaymentAction).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ provider: "fake" }),
      ),
    );
  });

  it("shows one disabled button with the reason when no provider can pay", () => {
    renderPay({
      providers: [
        { ...razorpay, available: false, unavailableReason: "unsupported_currency" },
        { ...fake, available: false, unavailableReason: "too_small" },
      ],
    });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Pay by card" })).toBeDisabled();
    expect(screen.getByText("Too small to pay by card")).toBeInTheDocument();
  });

  it("says the currency isn't supported when no provider can charge it", () => {
    renderPay({
      providers: [{ ...razorpay, available: false, unavailableReason: "unsupported_currency" }],
    });
    expect(screen.getByRole("button", { name: "Pay by card" })).toBeDisabled();
    expect(
      screen.getByText("Card payments don't work in your family's currency yet."),
    ).toBeInTheDocument();
  });

  it("keeps every provider's button working while a checkout page is open", async () => {
    startCardPaymentAction.mockResolvedValue({ ok: true, data: undefined });
    renderPay({
      providers: [
        { ...stripe, available: true, unavailableReason: null },
        { ...fake, available: true, unavailableReason: null },
      ],
      pending: { provider: "fake", redirectUrl: "https://checkout.example/p" },
    });
    expect(screen.getByRole("button", { name: "Pay with Test card" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Pay with Stripe" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Pay with Stripe" }));
    await waitFor(() =>
      expect(startCardPaymentAction).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ provider: "stripe" }),
      ),
    );
  });

  it("blocks every provider while an auto charge is in flight", () => {
    renderPay({
      providers: [
        { ...stripe, available: true, unavailableReason: null },
        { ...fake, available: true, unavailableReason: null },
      ],
      pending: { provider: "stripe", redirectUrl: null },
    });
    expect(screen.getByRole("button", { name: "Pay with Stripe" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Pay with Test card" })).toBeDisabled();
  });

  it("is disabled while the split doesn't add up to the full amount", () => {
    renderPay({}, { cash: 100, saved: 0 });
    expect(screen.getByRole("button", { name: "Pay with Test card" })).toBeDisabled();
    expect(screen.getByText("Card pays the full amount")).toBeInTheDocument();
  });

  it("renders nothing when card payments are off", () => {
    renderPay({ providers: [] });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says a card payment is in progress", () => {
    renderPay({ pending: { provider: "fake", redirectUrl: "https://checkout.example/p" } });
    expect(screen.getByText("Card payment in progress")).toBeInTheDocument();
  });

  it("blocks a second payment while an auto charge is in flight", () => {
    renderPay({ pending: { provider: "fake", redirectUrl: null } });
    expect(screen.getByText("Card payment in progress")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay with Test card" })).toBeDisabled();
  });

  it("tells the parent to refund a card payment that arrived after a cash handover", () => {
    renderPay({ lastOutcome: { status: "succeeded_unapplied", failureCode: null } });
    expect(
      screen.getByText(
        "Paid by card after it was already handed over. Refund it from the provider's dashboard.",
      ),
    ).toBeInTheDocument();
  });

  it("says a failed card payment didn't go through, with the reason", () => {
    renderPay({ lastOutcome: { status: "failed", failureCode: "insufficient_funds" } });
    expect(screen.getByText("Card payment didn't go through")).toBeInTheDocument();
    expect(screen.getByText(/The card didn't have enough money\./)).toBeInTheDocument();
  });

  it("puts each provider's logo before its name, hidden from assistive tech", () => {
    renderPay({
      providers: [
        { id: "stripe", label: "Stripe", available: true, unavailableReason: null },
        { id: "razorpay", label: "Razorpay", available: true, unavailableReason: null },
      ],
    });
    for (const [id, label] of [
      ["stripe", "Stripe"],
      ["razorpay", "Razorpay"],
    ] as const) {
      const button = screen.getByRole("button", { name: `Pay with ${label}` });
      expect(button.querySelector(`[data-provider-logo="${id}"]`)).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }
  });

  it("shows the provider's name, not Pay by card, with one provider", () => {
    renderPay({
      providers: [{ ...razorpay, available: true, unavailableReason: null }],
    });
    const button = screen.getByRole("button", { name: "Pay with Razorpay" });
    expect(button).toHaveTextContent(/^Razorpay$/);
    expect(button.querySelector('[data-provider-logo="razorpay"]')).toBeInTheDocument();
    expect(screen.queryByText("Pay by card")).not.toBeInTheDocument();
  });
});
