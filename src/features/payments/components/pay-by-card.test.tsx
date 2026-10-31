import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardPaymentState } from "../types";
import { PayByCard } from "./pay-by-card";

const startCardPaymentAction = vi.hoisted(() => vi.fn());
vi.mock("../server/actions", () => ({ startCardPaymentAction }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ready: CardPaymentState = {
  available: true,
  unavailableReason: null,
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
  it("offers Pay by card when a card can pay", () => {
    renderPay();
    expect(screen.getByRole("button", { name: "Pay by card" })).toBeEnabled();
  });

  it("starts a card payment for the full amount with the split", async () => {
    startCardPaymentAction.mockResolvedValue({ ok: true, data: undefined });
    renderPay();
    fireEvent.click(screen.getByRole("button", { name: "Pay by card" }));
    await waitFor(() =>
      expect(startCardPaymentAction).toHaveBeenCalledWith(null, {
        kind: "allowance",
        id: "00000000-0000-4000-8000-000000000001",
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
    fireEvent.click(screen.getByRole("button", { name: "Pay by card" }));
    expect(await screen.findByText("Card payments aren't available right now.")).toBeVisible();
  });

  it("is disabled with a reason when the amount is too small", () => {
    renderPay({ available: false, unavailableReason: "too_small" });
    expect(screen.getByRole("button", { name: "Pay by card" })).toBeDisabled();
    expect(screen.getByText("Too small to pay by card")).toBeInTheDocument();
  });

  it("is disabled while the split doesn't add up to the full amount", () => {
    renderPay({}, { cash: 100, saved: 0 });
    expect(screen.getByRole("button", { name: "Pay by card" })).toBeDisabled();
    expect(screen.getByText("Card pays the full amount")).toBeInTheDocument();
  });

  it("renders nothing when card payments are off", () => {
    renderPay({ available: false, unavailableReason: "off" });
    expect(screen.queryByRole("button", { name: "Pay by card" })).not.toBeInTheDocument();
  });

  it("says a card payment is in progress", () => {
    renderPay({ pending: { redirectUrl: "https://checkout.example/p" } });
    expect(screen.getByText("Card payment in progress")).toBeInTheDocument();
  });

  it("blocks a second payment while an auto charge is in flight", () => {
    renderPay({ pending: { redirectUrl: null } });
    expect(screen.getByText("Card payment in progress")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay by card" })).toBeDisabled();
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
});
