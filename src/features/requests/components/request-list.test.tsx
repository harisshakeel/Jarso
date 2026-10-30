import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelRequestAction } from "../server/actions";
import type { SavingsRequest } from "../types";
import { RequestList } from "./request-list";

const { refresh, toast } = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast }));
vi.mock("../server/actions", () => ({ cancelRequestAction: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const request = (over: Partial<SavingsRequest>): SavingsRequest => ({
  id: "r1",
  kind: "withdrawal",
  status: "pending",
  amountMinor: 500,
  reason: null,
  auto: false,
  occurredAt: "2026-10-28T10:00:00Z",
  ...over,
});

describe("RequestList", () => {
  it("shows a chip per status and Cancel only on Waiting", () => {
    render(
      <RequestList
        currency="GBP"
        requests={[
          request({ id: "1", status: "pending" }),
          request({ id: "2", status: "approved" }),
          request({ id: "3", status: "handed_over" }),
          request({ id: "4", kind: "deposit", status: "confirmed" }),
          request({ id: "5", status: "rejected" }),
          request({ id: "6", status: "cancelled" }),
        ]}
      />,
    );
    for (const label of ["Waiting", "Approved", "Not approved", "Cancelled"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText("Done")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^Cancel/ })).toHaveLength(1);
  });

  it("cancels a waiting request and refreshes", async () => {
    vi.mocked(cancelRequestAction).mockResolvedValue({ ok: true, data: "cancelled" });
    render(<RequestList currency="GBP" requests={[request({})]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Cancel/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(cancelRequestAction).toHaveBeenCalledWith(null, { requestId: "r1" });
  });

  it("is calm when the request already moved on", async () => {
    vi.mocked(cancelRequestAction).mockResolvedValue({ ok: true, data: "already_closed" });
    render(<RequestList currency="GBP" requests={[request({})]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Cancel/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("This one already moved on."));
    expect(refresh).toHaveBeenCalled();
  });
});
