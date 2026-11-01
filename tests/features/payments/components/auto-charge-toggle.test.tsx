import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("AutoChargeToggle", () => {
  it("reflects the current value", () => {
    render(<AutoChargeToggle target={target} on cardSaved />);
    expect(screen.getByRole("switch", { name: "Auto charge" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("follows a new value from the server", () => {
    const { rerender } = render(<AutoChargeToggle target={target} on={false} cardSaved />);
    const toggle = screen.getByRole("switch", { name: "Auto charge" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    rerender(<AutoChargeToggle target={target} on cardSaved />);
    expect(screen.getByRole("switch", { name: "Auto charge" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("shows the mandate before saving a card, then sends the parent to save one", async () => {
    setAutoChargeAction.mockResolvedValue({ ok: true, data: undefined });
    render(<AutoChargeToggle target={target} on={false} cardSaved={false} />);
    expect(screen.queryByText(MANDATE)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Auto charge" }));
    expect(await screen.findByText(MANDATE)).toBeInTheDocument();
    expect(setAutoChargeAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save a card" }));
    await waitFor(() =>
      expect(setAutoChargeAction).toHaveBeenCalledWith(null, {
        ...target,
        on: true,
        returnTo: "/parent/children/c1/allowance",
      }),
    );
  });

  it("turns on straight away with a saved card", async () => {
    setAutoChargeAction.mockResolvedValue({ ok: true, data: undefined });
    render(<AutoChargeToggle target={target} on={false} cardSaved />);
    fireEvent.click(screen.getByRole("switch", { name: "Auto charge" }));
    await waitFor(() =>
      expect(setAutoChargeAction).toHaveBeenCalledWith(null, {
        ...target,
        on: true,
        returnTo: "/parent/children/c1/allowance",
      }),
    );
    expect(screen.getByRole("switch", { name: "Auto charge" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it.each([
    ["unsupported_currency", "Card payments don't work in your family's currency yet."],
    ["overdue", "This gift's day has passed, so auto charge can't pay it. Hand it over instead."],
  ] as const)("hides the switch and says why when %s", (reason, text) => {
    render(
      <AutoChargeToggle
        target={{ type: "parent_gift", id: target.id }}
        on={false}
        cardSaved
        unavailable={reason}
      />,
    );
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByText("Auto charge")).toBeVisible();
    expect(screen.getByText(text)).toBeVisible();
  });

  it("goes back and shows the error when turning off fails", async () => {
    setAutoChargeAction.mockResolvedValue({
      ok: false,
      error: { code: "CONFLICT", message: "There's nothing left to charge for this." },
    });
    render(<AutoChargeToggle target={target} on cardSaved />);
    fireEvent.click(screen.getByRole("switch", { name: "Auto charge" }));
    expect(await screen.findByText("There's nothing left to charge for this.")).toBeVisible();
    expect(screen.getByRole("switch", { name: "Auto charge" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
