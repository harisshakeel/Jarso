import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoChargeToggle } from "@/features/payments/components/auto-charge-toggle";
import type { AutoChargeCard } from "@/features/payments/types";

const setAutoChargeAction = vi.hoisted(() => vi.fn());
vi.mock("@/features/payments/server/actions", () => ({ setAutoChargeAction }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/parent/children/c1/allowance",
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const MANDATE =
  "Jarso will charge this card the allowance or gift amount on the day it's due, until you turn auto charge off.";
const target = { type: "allowance_schedule" as const, id: "00000000-0000-4000-8000-000000000002" };
const returnTo = "/parent/children/c1/allowance";
const visa = { brand: "visa", last4: "4242" };
const mastercard = { brand: "mastercard", last4: "4444" };

const card = (
  provider: AutoChargeCard["provider"],
  label: string,
  saved: AutoChargeCard["card"] = null,
  unavailableReason: AutoChargeCard["unavailableReason"] = null,
): AutoChargeCard => ({
  provider,
  label,
  cardSaved: saved !== null,
  card: saved,
  unavailableReason,
});

type Props = ComponentProps<typeof AutoChargeToggle>;
function renderToggle(props: Partial<Props> = {}) {
  const all: Props = {
    target,
    on: false,
    provider: null,
    mine: false,
    cards: [card("fake", "Test card", visa)],
    ...props,
  };
  return { ...render(<AutoChargeToggle {...all} />), props: all };
}

const toggle = () => screen.getByRole("switch", { name: "Auto charge" });

describe("AutoChargeToggle", () => {
  it("reflects the current value", () => {
    renderToggle({ on: true, provider: "fake", mine: true });
    expect(toggle()).toHaveAttribute("aria-checked", "true");
  });

  it("follows a new value from the server", () => {
    const { rerender, props } = renderToggle();
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    rerender(<AutoChargeToggle {...props} on provider="fake" mine />);
    expect(toggle()).toHaveAttribute("aria-checked", "true");
  });

  it("turns on straight away with the one saved card", async () => {
    setAutoChargeAction.mockResolvedValue({ ok: true, data: undefined });
    renderToggle({ cards: [card("stripe", "Stripe"), card("fake", "Test card", visa)] });
    fireEvent.click(toggle());
    await waitFor(() =>
      expect(setAutoChargeAction).toHaveBeenCalledWith(null, {
        ...target,
        on: true,
        provider: "fake",
        returnTo,
      }),
    );
    expect(toggle()).toHaveAttribute("aria-checked", "true");
  });

  it("asks which card when several are saved", async () => {
    setAutoChargeAction.mockResolvedValue({ ok: true, data: undefined });
    renderToggle({
      cards: [card("stripe", "Stripe", mastercard), card("fake", "Test card", visa)],
    });
    fireEvent.click(toggle());
    expect(await screen.findByText("Which card should pay?")).toBeInTheDocument();
    expect(setAutoChargeAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Mastercard ending 4444, Stripe" }));
    await waitFor(() =>
      expect(setAutoChargeAction).toHaveBeenCalledWith(null, {
        ...target,
        on: true,
        provider: "stripe",
        returnTo,
      }),
    );
  });

  it("shows the mandate before saving a card, then sends the parent to save one", async () => {
    setAutoChargeAction.mockResolvedValue({ ok: true, data: undefined });
    renderToggle({ cards: [card("fake", "Test card")] });
    expect(screen.queryByText(MANDATE)).not.toBeInTheDocument();

    fireEvent.click(toggle());
    expect(await screen.findByText(MANDATE)).toBeInTheDocument();
    expect(setAutoChargeAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save a card" }));
    await waitFor(() =>
      expect(setAutoChargeAction).toHaveBeenCalledWith(null, {
        ...target,
        on: true,
        provider: "fake",
        returnTo,
      }),
    );
  });

  it("asks which provider to save a card with when several are on", async () => {
    setAutoChargeAction.mockResolvedValue({ ok: true, data: undefined });
    renderToggle({
      cards: [
        card("stripe", "Stripe"),
        card("razorpay", "Razorpay", null, "unsupported_currency"),
        card("fake", "Test card"),
      ],
    });
    fireEvent.click(toggle());
    expect(await screen.findByText(MANDATE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save a card" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save with Razorpay" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save with Stripe" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save with Test card" }));
    await waitFor(() =>
      expect(setAutoChargeAction).toHaveBeenCalledWith(null, {
        ...target,
        on: true,
        provider: "fake",
        returnTo,
      }),
    );
  });

  it("stacks several choices in provider order with Not now last", async () => {
    renderToggle({ cards: [card("stripe", "Stripe"), card("razorpay", "Razorpay")] });
    fireEvent.click(toggle());
    await screen.findByText(MANDATE);
    const footer = screen.getByRole("button", { name: "Not now" }).parentElement;
    expect(footer).toHaveClass("flex-col", "sm:flex-col");
    expect(
      within(footer as HTMLElement)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Save with Stripe", "Save with Razorpay", "Not now"]);
  });

  it("names the card it uses when several providers are on", () => {
    renderToggle({
      on: true,
      provider: "stripe",
      mine: true,
      cards: [card("stripe", "Stripe", visa), card("fake", "Test card", mastercard)],
    });
    expect(screen.getByText("Charges Visa ending 4242, Stripe.")).toBeInTheDocument();
  });

  it("names only the provider when another parent's card pays", () => {
    renderToggle({
      on: true,
      provider: "stripe",
      mine: false,
      cards: [card("stripe", "Stripe", visa), card("fake", "Test card")],
    });
    expect(screen.getByText("Charges a card saved with Stripe.")).toBeInTheDocument();
    expect(screen.queryByText(/Visa ending 4242/)).not.toBeInTheDocument();
  });

  it("doesn't name the card when only one provider is on", () => {
    renderToggle({ on: true, provider: "fake", mine: true });
    expect(screen.queryByText(/^Charges/)).not.toBeInTheDocument();
  });

  it("turns off without a provider", async () => {
    setAutoChargeAction.mockResolvedValue({ ok: true, data: undefined });
    renderToggle({ on: true, provider: "fake", mine: true });
    fireEvent.click(toggle());
    await waitFor(() =>
      expect(setAutoChargeAction).toHaveBeenCalledWith(null, { ...target, on: false, returnTo }),
    );
  });

  it("says the currency isn't supported when no provider can charge it", () => {
    renderToggle({ cards: [card("razorpay", "Razorpay", null, "unsupported_currency")] });
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByText("Auto charge")).toBeVisible();
    expect(
      screen.getByText("Card payments don't work in your family's currency yet."),
    ).toBeVisible();
  });

  it("hides the switch and says why when the gift is overdue", () => {
    renderToggle({ target: { type: "parent_gift", id: target.id }, unavailable: "overdue" });
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "This gift's day has passed, so auto charge can't pay it. Hand it over instead.",
      ),
    ).toBeVisible();
  });

  it("goes back and shows the error when turning off fails", async () => {
    setAutoChargeAction.mockResolvedValue({
      ok: false,
      error: { code: "CONFLICT", message: "There's nothing left to charge for this." },
    });
    renderToggle({ on: true, provider: "fake", mine: true });
    fireEvent.click(toggle());
    expect(await screen.findByText("There's nothing left to charge for this.")).toBeVisible();
    expect(toggle()).toHaveAttribute("aria-checked", "true");
  });
});
