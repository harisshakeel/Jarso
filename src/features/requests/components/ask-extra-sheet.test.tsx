import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmergencyAction } from "../server/actions";
import type { EmergencyResult } from "../types";
import { AskExtraSheet } from "./ask-extra-sheet";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../server/actions", () => ({ createEmergencyAction: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function ask(result: EmergencyResult, reason = "School trip") {
  vi.mocked(createEmergencyAction).mockResolvedValue({ ok: true, data: result });
  render(<AskExtraSheet currency="GBP" />);
  fireEvent.click(screen.getByRole("button", { name: "Ask for extra" }));
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText("What's it for?"), { target: { value: reason } });
  fireEvent.click(screen.getByRole("button", { name: /^Ask$/ }));
}

describe("AskExtraSheet", () => {
  it("explains where the money lands", () => {
    render(<AskExtraSheet currency="GBP" />);
    fireEvent.click(screen.getByRole("button", { name: "Ask for extra" }));
    expect(screen.getByText(/goes into Spend when they hand it over/)).toBeInTheDocument();
  });

  it("sends the amount and reason with one key, and says it was sent", async () => {
    ask({ status: "pending", requestId: "r1" });
    expect(await screen.findByRole("status")).toHaveTextContent("Sent to your parent");
    const [, input] = vi.mocked(createEmergencyAction).mock.calls[0] ?? [];
    expect(input).toMatchObject({ amount: "5", reason: "School trip" });
    expect((input as { idempotencyKey: string }).idempotencyKey).toMatch(/[0-9a-f-]{36}/);
  });

  it("refreshes the page behind it only once the sheet closes", async () => {
    ask({ status: "pending", requestId: "r1" });
    await screen.findByRole("status");
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("says already sent when a retried key finds a decided request", async () => {
    ask({ status: "already_sent", requestId: "r1" });
    expect(await screen.findByRole("status")).toHaveTextContent("Already sent to your parent");
  });

  it("shows the reason field's error from the server", async () => {
    vi.mocked(createEmergencyAction).mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Invalid",
        fieldErrors: { reason: ["Say what it's for."] },
      },
    });
    render(<AskExtraSheet currency="GBP" />);
    fireEvent.click(screen.getByRole("button", { name: "Ask for extra" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /^Ask$/ }));
    expect(await screen.findByText("Say what it's for.")).toBeInTheDocument();
  });
});
