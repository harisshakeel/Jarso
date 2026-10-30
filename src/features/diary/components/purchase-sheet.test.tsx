import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PurchaseSheet } from "./purchase-sheet";

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
  payload: { amount: string; label?: string; idempotencyKey: string };
  idempotencyKey: string;
  occurredAt: string;
};

function sent(call: number): Submitted {
  return submitToOutbox.mock.calls[call]?.[0] as Submitted;
}

async function save(amount: string, label?: string, calls = 1) {
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: amount } });
  if (label)
    fireEvent.change(screen.getByLabelText("What for? (optional)"), { target: { value: label } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
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
      label: "Comic",
      idempotencyKey: input.idempotencyKey,
    });
    expect(input.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(Number.isNaN(Date.parse(input.occurredAt))).toBe(false);
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
    expect(screen.getByLabelText("What for? (optional)")).toHaveValue("Game");
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
    expect(screen.getByLabelText("What for? (optional)")).toHaveValue("Chips");
  });

  it("asks for an amount before saving anything", async () => {
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByLabelText("Amount")).toHaveAttribute("aria-invalid", "true");
    expect(submitToOutbox).not.toHaveBeenCalled();
  });
});
