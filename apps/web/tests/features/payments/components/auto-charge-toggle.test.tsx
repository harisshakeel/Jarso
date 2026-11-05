import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutoChargeCard } from "@/features/payments";
import { AutoChargeToggle } from "@/features/payments/components/auto-charge-toggle";

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
  needsPhone = false,
): AutoChargeCard => ({
  provider,
  label,
  cardSaved: saved !== null,
  card: saved,
  unavailableReason,
  needsPhone,
});

/** Razorpay with no card saved: saving one first asks for the parent's phone. */
const razorpay = () => card("razorpay", "Razorpay", null, null, true);
const PHONE_HELP = "Razorpay needs your mobile number to save a card. Jarso doesn't keep it.";

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

    // Stripe's choice carries its logo; the fake has none. The name stays the label alone.
    const stripe = screen.getByRole("button", { name: "Mastercard ending 4444, Stripe" });
    expect(stripe.querySelector('[data-provider-logo="stripe"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Visa ending 4242, Test card" }).querySelector("svg"),
    ).toBeNull();

    fireEvent.click(stripe);
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

    // One provider: no choice to make, just Proceed (named for it).
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    const proceed = screen.getByRole("button", { name: "Proceed with Test card" });
    expect(proceed).toHaveTextContent(/^Proceed$/);
    fireEvent.click(proceed);
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
    // A row per usable provider, the first chosen; one that can't charge isn't offered.
    expect(screen.queryByRole("radio", { name: "Razorpay" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Stripe" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Proceed with Stripe" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Test card" }));
    fireEvent.click(screen.getByRole("button", { name: "Proceed with Test card" }));
    await waitFor(() =>
      expect(setAutoChargeAction).toHaveBeenCalledWith(null, {
        ...target,
        on: true,
        provider: "fake",
        returnTo,
      }),
    );
  });

  it("lists providers as radio rows with logos, in provider order, then Not now and Proceed", async () => {
    renderToggle({ cards: [card("stripe", "Stripe"), card("razorpay", "Razorpay")] });
    fireEvent.click(toggle());
    await screen.findByText(MANDATE);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((radio) => radio.closest("label")?.textContent)).toEqual([
      "Stripe",
      "Razorpay",
    ]);
    expect(
      radios[1]?.closest("label")?.querySelector('[data-provider-logo="razorpay"]'),
    ).toHaveAttribute("aria-hidden", "true");
    const footer = screen.getByRole("button", { name: "Not now" }).parentElement;
    expect(
      within(footer as HTMLElement)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Not now", "Proceed"]);
  });

  it("asks for the mobile number before saving a card with a provider that needs it", async () => {
    setAutoChargeAction.mockResolvedValue({ ok: true, data: undefined });
    renderToggle({ cards: [razorpay()] });
    fireEvent.click(toggle());
    await screen.findByText(MANDATE);
    expect(screen.queryByLabelText("Mobile number")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Proceed with Razorpay" }));
    const phone = await screen.findByLabelText("Mobile number");
    expect(phone).toHaveAttribute("type", "tel");
    expect(phone).toHaveAttribute("autocomplete", "tel");
    expect(phone).toHaveAttribute("inputmode", "tel");
    expect(screen.getByText(PHONE_HELP)).toBeVisible();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(setAutoChargeAction).not.toHaveBeenCalled();

    fireEvent.change(phone, { target: { value: "+91 90000 00000" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(setAutoChargeAction).toHaveBeenCalledWith(null, {
        ...target,
        on: true,
        provider: "razorpay",
        returnTo,
        phone: "+91 90000 00000",
      }),
    );
  });

  it("moves focus to the mobile number field when it appears", async () => {
    renderToggle({ cards: [card("stripe", "Stripe"), razorpay()] });
    fireEvent.click(toggle());
    fireEvent.click(await screen.findByRole("radio", { name: "Razorpay" }));
    fireEvent.click(screen.getByRole("button", { name: "Proceed with Razorpay" }));
    const phone = await screen.findByLabelText("Mobile number");
    await waitFor(() => expect(phone).toHaveFocus());
  });

  it("doesn't ask for a phone for a provider that doesn't need one", async () => {
    setAutoChargeAction.mockResolvedValue({ ok: true, data: undefined });
    renderToggle({ cards: [card("stripe", "Stripe"), razorpay()] });
    fireEvent.click(toggle());
    fireEvent.click(await screen.findByRole("button", { name: "Proceed with Stripe" }));
    await waitFor(() =>
      expect(setAutoChargeAction).toHaveBeenCalledWith(null, {
        ...target,
        on: true,
        provider: "stripe",
        returnTo,
      }),
    );
    expect(screen.queryByLabelText("Mobile number")).not.toBeInTheDocument();
  });

  it("shows a refused phone next to the field and keeps the form open", async () => {
    setAutoChargeAction.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Please fix the highlighted fields.",
        fieldErrors: { phone: ["Enter a mobile number with 8 to 15 digits."] },
      },
    });
    renderToggle({ cards: [razorpay()] });
    fireEvent.click(toggle());
    fireEvent.click(await screen.findByRole("button", { name: "Proceed with Razorpay" }));
    fireEvent.change(await screen.findByLabelText("Mobile number"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Enter a mobile number with 8 to 15 digits.")).toBeVisible();
    expect(screen.getByLabelText("Mobile number")).toHaveAttribute("aria-invalid", "true");
    // The switch sits behind the open dialog, so it is hidden from the accessibility tree.
    expect(screen.getByRole("switch", { name: "Auto charge", hidden: true })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("shows the card it uses on its own line, with its provider and logo", () => {
    renderToggle({
      on: true,
      provider: "stripe",
      mine: true,
      cards: [card("stripe", "Stripe", visa), card("fake", "Test card", mastercard)],
    });
    expect(screen.getByText("Visa ending 4242")).toBeInTheDocument();
    const line = screen.getByText("Saved with Stripe").closest("div");
    expect(line?.querySelector('[data-provider-logo="stripe"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
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

  it("shows the card it uses with only one provider on too", () => {
    renderToggle({ on: true, provider: "fake", mine: true });
    expect(screen.getByText("Visa ending 4242")).toBeInTheDocument();
    expect(screen.getByText("Saved with Test card")).toBeInTheDocument();
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

  it("keeps the switch of an overdue gift that is on, so it can be turned off", async () => {
    setAutoChargeAction.mockResolvedValue({ ok: true, data: { redirectUrl: null } });
    renderToggle({
      target: { type: "parent_gift", id: target.id },
      unavailable: "overdue",
      on: true,
      provider: "fake",
      mine: true,
    });
    fireEvent.click(toggle());
    await waitFor(() =>
      expect(setAutoChargeAction).toHaveBeenCalledWith(null, {
        type: "parent_gift",
        id: target.id,
        on: false,
        returnTo,
      }),
    );
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
