import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PurchaseSheet } from "@/features/diary/components/purchase-sheet";

const { submitToOutbox, removeOutboxItem, refresh } = vi.hoisted(() => ({
  submitToOutbox: vi.fn(),
  removeOutboxItem: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/offline", async () => ({
  offlineCopy: (await import("@/features/offline/copy")).offlineCopy,
  newId: (await import("@/features/offline/outbox/uuid")).uuid,
  submitToOutbox,
  removeOutboxItem,
}));

const EMPTY_SPEND =
  "Your Spend jar is empty right now. Record money you got first, or ask a parent.";

beforeEach(() => {
  vi.clearAllMocks();
  removeOutboxItem.mockResolvedValue(undefined);
});
afterEach(cleanup);

function openSheet() {
  render(<PurchaseSheet currency="GBP" userId="child-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Spent something?" }));
}

type Submitted = {
  userId: string;
  kind: string;
  payload: { amount: string; category: string; label?: string; idempotencyKey: string };
  idempotencyKey: string;
};

function sent(call: number): Submitted {
  return submitToOutbox.mock.calls[call]?.[0] as Submitted;
}

const NAME = "Name it (optional)";

async function save(amount: string, label?: string, calls = 1, chip = "Snacks") {
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: amount } });
  fireEvent.click(screen.getByRole("radio", { name: chip }));
  if (label) fireEvent.change(screen.getByLabelText(NAME), { target: { value: label } });
  fireEvent.click(screen.getByRole("button", { name: "Write it down" }));
  await waitFor(() => expect(submitToOutbox).toHaveBeenCalledTimes(calls));
}

describe("PurchaseSheet", () => {
  it("sends the typed amount, label and one key through the outbox", async () => {
    submitToOutbox.mockResolvedValue({
      status: "sent",
      data: { status: "recorded", entryId: "e1" },
    });
    openSheet();
    await save("7.50", "Comic");
    const input = sent(0);
    expect(input.userId).toBe("child-1");
    expect(input.kind).toBe("purchase");
    expect(input.payload).toEqual({
      amount: "7.50",
      category: "snacks",
      label: "Comic",
      idempotencyKey: input.idempotencyKey,
    });
    expect(input.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    // No device time: the outbox sends the action's age instead.
    expect(input).not.toHaveProperty("occurredAt");
  });

  it("thanks the child, closes and refreshes once recorded", async () => {
    submitToOutbox.mockResolvedValue({
      status: "sent",
      data: { status: "recorded", entryId: "e1" },
    });
    openSheet();
    await save("7.50");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith("Saved. Nice one.");
    expect(refresh).toHaveBeenCalled();
  });

  it("explains a refusal inline, keeps the fields and drops the stored item", async () => {
    submitToOutbox.mockResolvedValue({ status: "refused", message: EMPTY_SPEND });
    openSheet();
    await save("9", "Game");
    expect(await screen.findByText(EMPTY_SPEND)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toHaveValue("9");
    expect(screen.getByLabelText(NAME)).toHaveValue("Game");
    expect(removeOutboxItem).toHaveBeenCalledWith(sent(0).idempotencyKey);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps the same key when it is sent again after a refusal", async () => {
    submitToOutbox.mockResolvedValue({ status: "refused", message: EMPTY_SPEND });
    openSheet();
    await save("9");
    await screen.findByRole("alert");
    await save("5", undefined, 2);
    expect(sent(1).idempotencyKey).toBe(sent(0).idempotencyKey);
  });

  it("says it is waiting to send and closes when queued", async () => {
    submitToOutbox.mockResolvedValue({ status: "queued" });
    openSheet();
    await save("3");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(toast).toHaveBeenCalledWith("Waiting to send. We'll add it when you're back online.");
  });

  it("shows the offline copy and keeps the fields when nothing could be saved", async () => {
    submitToOutbox.mockResolvedValue({ status: "unsaved" });
    openSheet();
    await save("3", "Chips");
    expect(await screen.findByText("You're offline, try again when connected")).toBeVisible();
    expect(screen.getByLabelText("Amount")).toHaveValue("3");
    expect(screen.getByLabelText(NAME)).toHaveValue("Chips");
  });

  it("shows the slow copy and keeps the fields when a direct send didn't go through", async () => {
    submitToOutbox.mockResolvedValue({ status: "unsent" });
    openSheet();
    await save("3", "Chips");
    expect(await screen.findByText("This is taking a while. Try again?")).toBeVisible();
    expect(screen.getByLabelText("Amount")).toHaveValue("3");
    expect(screen.getByLabelText(NAME)).toHaveValue("Chips");
  });

  it("asks for an amount before saving anything", async () => {
    openSheet();
    fireEvent.click(screen.getByRole("radio", { name: "Snacks" }));
    fireEvent.click(screen.getByRole("button", { name: "Write it down" }));
    // The field exists before the action answers, so wait on the attribute, not the element.
    await waitFor(() =>
      expect(screen.getByLabelText("Amount")).toHaveAttribute("aria-invalid", "true"),
    );
    expect(submitToOutbox).not.toHaveBeenCalled();
  });

  it("disables the button with a helper until a chip is pressed", () => {
    openSheet();
    expect(screen.getByRole("button", { name: "Write it down" })).toBeDisabled();
    expect(screen.getByText("Pick what it was for")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Snacks" }));
    expect(screen.getByRole("button", { name: "Write it down" })).toBeEnabled();
    expect(screen.queryByText("Pick what it was for")).not.toBeInTheDocument();
  });

  it("follows the chip with the name placeholder", () => {
    openSheet();
    const name = screen.getByLabelText(NAME);
    expect(name).toHaveAttribute("placeholder", "What was it?");
    fireEvent.click(screen.getByRole("radio", { name: "Snacks" }));
    expect(name).toHaveAttribute("placeholder", "What snack?");
    fireEvent.click(screen.getByRole("radio", { name: "Other" }));
    expect(name).toHaveAttribute("placeholder", "What was it?");
  });

  it("sends the pressed chip's category", async () => {
    submitToOutbox.mockResolvedValue({ status: "queued" });
    openSheet();
    await save("2", undefined, 1, "Games");
    expect(sent(0).payload.category).toBe("games");
  });

  it("lets the keyboard choose a chip", () => {
    openSheet();
    const chip = screen.getByRole("radio", { name: "Travel" });
    chip.focus();
    expect(chip).toHaveFocus();
    fireEvent.click(chip); // Space on a native radio fires click
    expect(chip).toBeChecked();
  });

  it("can open from a quiet button so a screen keeps one keycap", () => {
    render(<PurchaseSheet currency="GBP" userId="child-1" variant="outline" />);
    expect(screen.getByRole("button", { name: "Spent something?" })).not.toHaveClass("keycap");
  });
});
