import type { AllowancePlan } from "@jarso/core/guide";
import type { DepositResult } from "@jarso/core/requests";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AllowancePlanCard } from "@/features/requests/components/allowance-plan-card";
import {
  acceptAllowancePlanAction,
  dismissAllowancePlanAction,
} from "@/features/requests/server/actions";

vi.mock("@/features/requests/server/actions", () => ({
  acceptAllowancePlanAction: vi.fn(),
  dismissAllowancePlanAction: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const plan: AllowancePlan = { saveMinor: 400, spendMinor: 600, reason: "goal" };
const occurrenceId = "7d2b6f0e-6a55-4b1f-9a4e-3c1f2f6f0a11";

function renderCard(over: Partial<Parameters<typeof AllowancePlanCard>[0]> = {}) {
  return render(
    <AllowancePlanCard
      occurrenceId={occurrenceId}
      plan={plan}
      decided={false}
      goalName="bike"
      currency="GBP"
      movesWithoutAsking={false}
      {...over}
    />,
  );
}

function accept(result: DepositResult) {
  vi.mocked(acceptAllowancePlanAction).mockResolvedValue({ ok: true, data: result });
  fireEvent.click(screen.getByRole("button", { name: "Do it" }));
}

describe("AllowancePlanCard", () => {
  it("proposes the split in the coach's words and says the parent confirms it", () => {
    renderCard();
    expect(
      screen.getByRole("region", { name: "Jarso's plan for today's pocket money" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Pop £4 into Save and your bike keeps moving. £6 stays in Spend."),
    ).toBeInTheDocument();
    expect(screen.getByText("Your parent will confirm it.")).toBeInTheDocument();
  });

  it("sends the plan's own figure and waits for the parent when moves need a yes", async () => {
    renderCard();
    accept({ status: "pending", requestId: "r1" });
    expect(await screen.findByText("Waiting for your parent to confirm")).toBeInTheDocument();
    const payload = vi.mocked(acceptAllowancePlanAction).mock.calls[0]?.[1] as FormData;
    expect(payload.get("occurrenceId")).toBe(occurrenceId);
    expect(payload.get("amountMinor")).toBe("400");
    expect(payload.get("idempotencyKey")).toMatch(/^[0-9a-f-]{36}$/);
    // Nothing moved yet, so no coin drops.
    expect(document.querySelector("[data-coin-drop]")).toBeNull();
  });

  it("moves at once with a note to the parent when they chose 'just tell me'", async () => {
    renderCard({ movesWithoutAsking: true });
    expect(screen.getByText("Your parent gets a note.")).toBeInTheDocument();
    accept({ status: "done", requestId: "r1" });
    expect(await screen.findByText("Added to Save. Your parent knows.")).toBeInTheDocument();
    expect(document.querySelector("[data-coin-drop]")).not.toBeNull();
  });

  it("keeps the plan and says what Spend has when Spend changed meanwhile", async () => {
    renderCard();
    accept({ status: "over_available", availableMinor: 250 });
    expect(await screen.findByText("Spend has £2.50")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Do it" })).toBeInTheDocument();
  });

  it("goes away on Not today", async () => {
    vi.mocked(dismissAllowancePlanAction).mockResolvedValue({ ok: true, data: undefined });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Not today" }));
    await vi.waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    const payload = vi.mocked(dismissAllowancePlanAction).mock.calls[0]?.[1] as FormData;
    expect(payload.get("occurrenceId")).toBe(occurrenceId);
  });

  it("shows nothing once the plan was decided on another visit", () => {
    const { container } = renderCard({ decided: true });
    expect(container).toBeEmptyDOMElement();
  });
});
