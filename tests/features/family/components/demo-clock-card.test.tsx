import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoClockCard } from "@/features/family/components/demo-clock-card";

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }));
vi.mock("@/features/family/server/actions", () => ({ advanceFamilyClockAction: vi.fn() }));

const { advanceFamilyClockAction } = await import("@/features/family/server/actions");

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("DemoClockCard", () => {
  it("shows the family's day and one 44 px button per move", () => {
    render(<DemoClockCard today="2026-11-02" />);
    expect(screen.getByText("Monday, 2 November 2026")).toBeInTheDocument();
    for (const name of ["+1 day", "+7 days", "+1 month"]) {
      expect(screen.getByRole("button", { name })).toHaveClass("h-11");
    }
  });

  it("moves the clock by the chosen days and says the new day", async () => {
    vi.mocked(advanceFamilyClockAction).mockResolvedValue({
      ok: true,
      data: { offsetDays: 7, today: "2026-11-09", generated: 1, reminders: 2 },
    });
    render(<DemoClockCard today="2026-11-02" />);

    fireEvent.click(screen.getByRole("button", { name: "+7 days" }));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("It's now Monday, 9 November 2026"),
    );
    expect(advanceFamilyClockAction).toHaveBeenCalledWith(null, { days: 7 });
  });

  it("shows why a move was refused", async () => {
    vi.mocked(advanceFamilyClockAction).mockResolvedValue({
      ok: false,
      error: { code: "CONFLICT", message: "The demo clock is off for this family." },
    });
    render(<DemoClockCard today="2026-11-02" />);

    fireEvent.click(screen.getByRole("button", { name: "+1 month" }));

    expect(await screen.findByText("The demo clock is off for this family.")).toBeInTheDocument();
    expect(advanceFamilyClockAction).toHaveBeenCalledWith(null, { days: 30 });
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
