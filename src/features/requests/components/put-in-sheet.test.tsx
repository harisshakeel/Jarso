import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDepositAction } from "../server/actions";
import type { DepositResult } from "../types";
import { PutInSheet } from "./put-in-sheet";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../server/actions", () => ({ createDepositAction: vi.fn() }));

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
