import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelRequestAction,
  completeRequestAction,
  decideWithdrawalAction,
  rejectDepositAction,
} from "../server/actions";
import type { SavingsRequest } from "../types";
import { ParentRequestItems } from "./parent-request-items";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));
vi.mock("../server/actions", () => ({
  cancelRequestAction: vi.fn(),
  completeRequestAction: vi.fn(),
  decideWithdrawalAction: vi.fn(),
  rejectDepositAction: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const request = (over: Partial<SavingsRequest>): SavingsRequest => ({
  id: "r1",
  kind: "withdrawal",
  status: "pending",
  amountMinor: 500,
  reason: "New bike",
  auto: false,
  occurredAt: "2026-10-28T10:00:00Z",
  ...over,
});

const show = (r: SavingsRequest) =>
  render(<ParentRequestItems currency="GBP" items={[{ nickname: "Maya", request: r }]} />);

describe("ParentRequestItems", () => {
  it("renders nothing when there is nothing to do", () => {
    const { container } = render(<ParentRequestItems currency="GBP" items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers Approve and Not now for a pending withdrawal", () => {
    show(request({}));
    expect(screen.getByText("Maya wants £5.00: New bike")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
  });

  it("offers Confirm and a quiet way out for an approved withdrawal", () => {
    show(request({ status: "approved" }));
    expect(screen.getByText("Hand over £5.00 to Maya")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Didn't hand it over" })).toBeInTheDocument();
  });

  it("offers Confirm and Didn't get it for a pending deposit", () => {
    show(request({ kind: "deposit", reason: null }));
    expect(screen.getByText("Maya gave you £5.00?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Didn't get it" })).toBeInTheDocument();
  });

  it("approves and refreshes", async () => {
    vi.mocked(decideWithdrawalAction).mockResolvedValue({ ok: true, data: "approved" });
    show(request({}));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(decideWithdrawalAction).toHaveBeenCalledWith(null, { requestId: "r1", approve: true });
  });

  it("says so when Save no longer covers an approval", async () => {
    vi.mocked(decideWithdrawalAction).mockResolvedValue({ ok: true, data: "over_available" });
    show(request({}));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("There isn't enough in Save for this now.")).toBeInTheDocument();
  });

  it("declines with Not now", async () => {
    vi.mocked(decideWithdrawalAction).mockResolvedValue({ ok: true, data: "rejected" });
    show(request({}));
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() =>
      expect(decideWithdrawalAction).toHaveBeenCalledWith(null, {
        requestId: "r1",
        approve: false,
      }),
    );
  });

  it("sends the same key when Confirm is tapped twice", async () => {
    vi.mocked(completeRequestAction).mockResolvedValue({
      ok: false,
      error: { code: "CONFLICT", message: "Try again." },
    });
    show(request({ status: "approved" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(completeRequestAction).toHaveBeenCalledTimes(1));
    await screen.findByText("Try again.");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(completeRequestAction).toHaveBeenCalledTimes(2));
    const keys = vi
      .mocked(completeRequestAction)
      .mock.calls.map((c) => (c[1] as { idempotencyKey: string }).idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it("asks before cancelling an approved withdrawal", async () => {
    vi.mocked(cancelRequestAction).mockResolvedValue({ ok: true, data: "cancelled" });
    show(request({ status: "approved" }));
    fireEvent.click(screen.getByRole("button", { name: "Didn't hand it over" }));
    expect(cancelRequestAction).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Yes, didn't hand it over" }));
    await waitFor(() =>
      expect(cancelRequestAction).toHaveBeenCalledWith(null, { requestId: "r1" }),
    );
  });

  it("turns a deposit down with Didn't get it", async () => {
    vi.mocked(rejectDepositAction).mockResolvedValue({ ok: true, data: "rejected" });
    show(request({ kind: "deposit" }));
    fireEvent.click(screen.getByRole("button", { name: "Didn't get it" }));
    await waitFor(() =>
      expect(rejectDepositAction).toHaveBeenCalledWith(null, { requestId: "r1" }),
    );
  });
});
