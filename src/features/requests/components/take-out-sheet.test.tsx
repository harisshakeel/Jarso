import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWithdrawalAction } from "../server/actions";
import type { WithdrawalResult } from "../types";
import { TakeOutSheet } from "./take-out-sheet";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../server/actions", () => ({ createWithdrawalAction: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function ask(result: WithdrawalResult, ruleLines?: string[]) {
  vi.mocked(createWithdrawalAction).mockResolvedValue({ ok: true, data: result });
  render(<TakeOutSheet currency="GBP" limitMinor={500} ruleLines={ruleLines} />);
  fireEvent.click(screen.getByRole("button", { name: "Take out" }));
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("What's it for?"), { target: { value: "Bike" } });
  fireEvent.click(screen.getByRole("button", { name: "Ask" }));
}

describe("TakeOutSheet", () => {
  it("shows the limit, the fields and the child's rules", () => {
    render(
      <TakeOutSheet currency="GBP" limitMinor={500} ruleLines={["You can take out up to £5"]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Take out" }));
    expect(screen.getByText("You can take out up to £5", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("You can take out up to £5", { selector: "li" })).toBeInTheDocument();
    expect(screen.getByLabelText("What's it for?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask" })).toBeInTheDocument();
  });

  it("sends the amount, reason and one key", async () => {
    ask({ status: "pending", requestId: "r1" });
    await screen.findByText("Sent to your parent");
    const input = vi.mocked(createWithdrawalAction).mock.calls[0]?.[1] as Record<string, string>;
    expect(input.amount).toBe("4");
    expect(input.reason).toBe("Bike");
    expect(input.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(refresh).toHaveBeenCalled();
  });

  it("says a parent will hand it over when it is approved", async () => {
    ask({ status: "approved", requestId: "r1" });
    expect(await screen.findByText("Approved, your parent will hand it over")).toBeInTheDocument();
  });

  it("explains an over-cap ask and keeps the form", async () => {
    ask({ status: "over_cap", period: "week", capMinor: 1000, usedMinor: 700 });
    expect(await screen.findByText(/You can take out up to £10 a week\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask" })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says how much can come out when asking for too much", async () => {
    ask({ status: "over_available", availableMinor: 250 });
    await waitFor(() =>
      expect(screen.getAllByText("You can take out up to £2.50").length).toBeGreaterThan(0),
    );
    expect(screen.getByRole("status")).toHaveTextContent("You can take out up to £2.50");
  });

  it("uses a new key when the sheet is opened again after a request", async () => {
    ask({ status: "pending", requestId: "r1" });
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Take out" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(createWithdrawalAction).toHaveBeenCalledTimes(2));
    const [first, second] = vi
      .mocked(createWithdrawalAction)
      .mock.calls.map((c) => (c[1] as { idempotencyKey: string }).idempotencyKey);
    expect(first).not.toBe(second);
  });
});
