import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PurchaseSheet } from "./purchase-sheet";

const { recordPurchaseAction } = vi.hoisted(() => ({ recordPurchaseAction: vi.fn() }));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("../server/actions", () => ({ recordPurchaseAction, undoPurchaseAction: vi.fn() }));

beforeEach(() => recordPurchaseAction.mockReset());
afterEach(cleanup);

function openSheet() {
  render(<PurchaseSheet currency="GBP" />);
  fireEvent.click(screen.getByRole("button", { name: "Spent something?" }));
}

function sent(call: number): FormData {
  return recordPurchaseAction.mock.calls[call]?.[1] as FormData;
}

async function submit(amount: string, label?: string) {
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: amount } });
  if (label)
    fireEvent.change(screen.getByLabelText("What for? (optional)"), { target: { value: label } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(recordPurchaseAction).toHaveBeenCalled());
}

describe("PurchaseSheet", () => {
  it("sends the typed amount, label and an idempotency key", async () => {
    recordPurchaseAction.mockResolvedValue({
      ok: true,
      data: { status: "recorded", entryId: "e1" },
    });
    openSheet();
    await submit("7.50", "Comic");
    const data = sent(0);
    expect(data.get("amount")).toBe("7.50");
    expect(data.get("label")).toBe("Comic");
    expect(data.get("idempotencyKey")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("explains when there is not enough in Spend", async () => {
    recordPurchaseAction.mockResolvedValue({
      ok: true,
      data: { status: "not_enough_spend", freeMinor: 700 },
    });
    openSheet();
    await submit("9");
    expect(
      await screen.findByText(
        "That's more than you have in Spend (£7.00). Record money you got first, or ask a parent.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the same idempotency key when it is sent again", async () => {
    recordPurchaseAction.mockResolvedValue({
      ok: true,
      data: { status: "not_enough_spend", freeMinor: 700 },
    });
    openSheet();
    await submit("9");
    await screen.findByRole("alert");
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(recordPurchaseAction).toHaveBeenCalledTimes(2));
    expect(sent(1).get("idempotencyKey")).toBe(sent(0).get("idempotencyKey"));
  });
});
