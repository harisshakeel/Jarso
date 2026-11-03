import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchSavingSheet } from "@/features/allowance/components/match-saving-sheet";

const { matchSavingAction, success } = vi.hoisted(() => ({
  matchSavingAction: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/features/allowance/server/actions", () => ({ matchSavingAction }));
vi.mock("@/features/offline", async (original) => ({
  ...(await original<typeof import("@/features/offline")>()),
  runOnline: (action: () => Promise<unknown>) => action(),
}));
vi.mock("sonner", () => ({ toast: { success } }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const wait = { timeout: 5_000 };

function open() {
  render(
    <MatchSavingSheet
      childId="child-1"
      nickname="Aisha"
      currency="GBP"
      amountMinor={800}
      period="this week"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Match it for Aisha" }));
}

describe("MatchSavingSheet", () => {
  it("offers what the child saved and adds it to Save only on the tap", async () => {
    matchSavingAction.mockResolvedValue({ ok: true, data: { result: "confirmed", noted: true } });
    open();
    expect(await screen.findByText("Match Aisha's saving", {}, wait)).toBeVisible();
    expect(screen.getByText(/Aisha put £8\.00 into\s+Save this week\./)).toBeVisible();
    expect(screen.getByLabelText("Add to Save")).toHaveValue("8.00");
    expect(matchSavingAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add £8 to Save" }));
    await vi.waitFor(
      () =>
        expect(success).toHaveBeenCalledWith("Added to Aisha's Save", { description: undefined }),
      wait,
    );
    const form = matchSavingAction.mock.calls[0]?.[1] as FormData;
    expect(form.get("childId")).toBe("child-1");
    expect(form.get("amount")).toBe("8.00");
    expect(form.get("message")).toBe("I matched your saving!");
  });

  it("follows the amount the parent types, and says when the note didn't go", async () => {
    matchSavingAction.mockResolvedValue({ ok: true, data: { result: "confirmed", noted: false } });
    open();
    const amount = await screen.findByLabelText("Add to Save", {}, wait);
    fireEvent.change(amount, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add £5 to Save" }));
    await vi.waitFor(
      () =>
        expect(success).toHaveBeenCalledWith("Added to Aisha's Save", {
          description: "The note didn't go. Send it from Send a note.",
        }),
      wait,
    );
  });
});
