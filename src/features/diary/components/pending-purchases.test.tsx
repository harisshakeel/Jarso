import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboxItem } from "@/features/offline";
import { PendingPurchases } from "./pending-purchases";

const { useOutbox, useOnline, submitToOutbox, removeOutboxItem, refresh } = vi.hoisted(() => ({
  useOutbox: vi.fn(),
  useOnline: vi.fn(),
  submitToOutbox: vi.fn(),
  removeOutboxItem: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/offline", async () => ({
  offlineCopy: (await import("@/features/offline/copy")).offlineCopy,
  newId: (await import("@/features/offline/outbox/uuid")).uuid,
  showsAsPending: (await import("@/features/offline/outbox/state")).showsAsPending,
  useOutbox,
  useOnline,
  submitToOutbox,
  removeOutboxItem,
}));

const KEY = "5b7d8f1e-2c3a-4b5c-8d9e-0f1a2b3c4d5e";
const REFUSED =
  "That's more than you have in Spend (£7). Record money you got first, or ask a parent.";

function purchase(overrides: Partial<OutboxItem> = {}): OutboxItem {
  const at = "2026-10-30T09:00:00.000Z";
  return {
    id: KEY,
    userId: "child-1",
    kind: "purchase",
    payload: { amount: "20", label: "Comic", idempotencyKey: KEY },
    idempotencyKey: KEY,
    occurredAt: at,
    createdAt: at,
    attempts: 0,
    nextAttemptAt: at,
    status: "waiting",
    ...overrides,
  };
}

const needsLook = () => purchase({ status: "needs_look", message: REFUSED });

beforeEach(() => {
  vi.clearAllMocks();
  removeOutboxItem.mockResolvedValue(undefined);
  useOnline.mockReturnValue(true);
});
afterEach(cleanup);

function show(items: OutboxItem[]) {
  useOutbox.mockReturnValue(items);
  return render(<PendingPurchases userId="child-1" currency="GBP" />);
}

describe("PendingPurchases", () => {
  it("waiting shows the waiting copy", () => {
    show([purchase({ attempts: 1 })]);
    expect(useOutbox).toHaveBeenCalledWith("child-1");
    const line = screen.getByRole("listitem");
    expect(line).toHaveTextContent("Comic");
    expect(line).toHaveTextContent("£20");
    expect(line).toHaveTextContent("Waiting to send. We'll add it when you're back online.");
    expect(within(line).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a waiting item while offline, even before a send was tried", () => {
    useOnline.mockReturnValue(false);
    show([purchase()]);
    expect(screen.getByRole("listitem")).toHaveTextContent("Waiting to send.");
  });

  it("shows no card while an online save is in flight", () => {
    const { container } = show([purchase()]);
    expect(container).toBeEmptyDOMElement();
  });

  it("needs_look shows message and three actions", () => {
    show([needsLook()]);
    const line = screen.getByRole("listitem");
    expect(line).toHaveTextContent(REFUSED);
    expect(
      within(line)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Change it", "Ask a parent", "Remove"]);
  });

  it("Remove deletes the item", async () => {
    show([needsLook()]);
    fireEvent.click(screen.getByRole("button", { name: "Remove: Comic" }));
    await waitFor(() => expect(removeOutboxItem).toHaveBeenCalledWith(KEY));
  });

  it("Ask a parent shows the advice and keeps the item", () => {
    show([needsLook()]);
    fireEvent.click(screen.getByRole("button", { name: "Ask a parent: Comic" }));
    expect(screen.getByText("Show this to a parent and decide together.")).toBeVisible();
    expect(removeOutboxItem).not.toHaveBeenCalled();
  });

  it("Change it opens the sheet with the old amount", () => {
    show([needsLook()]);
    fireEvent.click(screen.getByRole("button", { name: "Change it: Comic" }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByLabelText("Amount")).toHaveValue("20");
    expect(within(sheet).getByLabelText("What for? (optional)")).toHaveValue("Comic");
  });

  it("Change it saves with a new key, then removes the old item", async () => {
    submitToOutbox.mockResolvedValue({ status: "queued" });
    show([needsLook()]);
    fireEvent.click(screen.getByRole("button", { name: "Change it: Comic" }));
    const sheet = screen.getByRole("dialog");
    fireEvent.change(within(sheet).getByLabelText("Amount"), { target: { value: "5" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(removeOutboxItem).toHaveBeenCalledWith(KEY));
    const input = submitToOutbox.mock.calls[0]?.[0] as { idempotencyKey: string };
    expect(input.idempotencyKey).not.toBe(KEY);
  });

  it("Change it keeps the old item when the new one is refused", async () => {
    submitToOutbox.mockResolvedValue({ status: "refused", message: REFUSED });
    show([needsLook()]);
    fireEvent.click(screen.getByRole("button", { name: "Change it: Comic" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(submitToOutbox).toHaveBeenCalled());
    await screen.findByRole("alert");
    const input = submitToOutbox.mock.calls[0]?.[0] as { idempotencyKey: string };
    expect(removeOutboxItem).toHaveBeenCalledWith(input.idempotencyKey);
    expect(removeOutboxItem).not.toHaveBeenCalledWith(KEY);
  });

  it("refreshes the page once an item has been sent in the background", () => {
    const view = show([purchase()]);
    useOutbox.mockReturnValue([]);
    view.rerender(<PendingPurchases userId="child-1" currency="GBP" />);
    expect(refresh).toHaveBeenCalled();
  });

  it("shows nothing when the list is empty", () => {
    const { container } = show([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the actions after Purchase when there is no label", () => {
    show([
      purchase({
        status: "needs_look",
        message: REFUSED,
        payload: { amount: "20", idempotencyKey: KEY },
      }),
    ]);
    expect(screen.getByRole("button", { name: "Change it: Purchase" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Ask a parent: Purchase" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove: Purchase" })).toBeVisible();
  });

  it("ignores items that are not purchases", () => {
    const { container } = show([purchase({ kind: "step", payload: { attemptId: "a" } })]);
    expect(container).toBeEmptyDOMElement();
  });
});
