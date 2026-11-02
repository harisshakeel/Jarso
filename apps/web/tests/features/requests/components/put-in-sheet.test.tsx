import type { DepositResult } from "@jarso/core/requests";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PutInSheet } from "@/features/requests/components/put-in-sheet";
import { createDepositAction } from "@/features/requests/server/actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/requests/server/actions", () => ({ createDepositAction: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function putIn(result: DepositResult) {
  vi.mocked(createDepositAction).mockResolvedValue({ ok: true, data: result });
  render(<PutInSheet currency="GBP" availableSpendMinor={800} />);
  fireEvent.click(screen.getByRole("button", { name: "Put in" }));
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Put in", hidden: false }));
}

describe("PutInSheet", () => {
  it("says already sent when a retried key finds a closed request", async () => {
    putIn({ status: "already_sent", requestId: "r1" });
    expect(await screen.findByText("Already sent to your parent")).toBeInTheDocument();
  });

  it("shows what Spend has", () => {
    render(<PutInSheet currency="GBP" availableSpendMinor={800} />);
    fireEvent.click(screen.getByRole("button", { name: "Put in" }));
    expect(screen.getByText("Spend has £8")).toBeInTheDocument();
  });

  it("waits for the parent when the deposit is pending", async () => {
    putIn({ status: "pending", requestId: "r1" });
    expect(await screen.findByText("Waiting for your parent to confirm")).toBeInTheDocument();
  });

  it("says it is added when confirmed straight away", async () => {
    putIn({ status: "confirmed", requestId: "r1" });
    expect(await screen.findByText("Added to Save")).toBeInTheDocument();
  });

  it("says what Spend has when asking for too much", async () => {
    putIn({ status: "over_available", availableMinor: 250 });
    expect(await screen.findByRole("status")).toHaveTextContent("Spend has £2.50");
  });
});
