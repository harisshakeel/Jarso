import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { saveTourAction, push } = vi.hoisted(() => ({
  saveTourAction: vi.fn(async (_prev: unknown, _input: unknown) => ({
    ok: true as const,
    data: undefined,
  })),
  push: vi.fn(),
}));

vi.mock("@/features/tour/server/actions", () => ({ saveTourAction }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/child",
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

import { startTour, WelcomeTour } from "@/features/tour";

Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  window.sessionStorage.clear();
  saveTourAction.mockClear();
});
afterEach(cleanup);

describe("WelcomeTour", () => {
  it("lets the child pick a buddy, who then walks them through, and Skip ends it", async () => {
    render(<WelcomeTour name="Sam" buddy={null} show />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Pick Pip as your buddy" }, { timeout: 2000 }),
    );
    expect(saveTourAction).toHaveBeenCalledWith(null, { buddy: "pip" });

    expect(
      await screen.findByText(
        "Hey Sam, I'm Pip! Let's check out your money world.",
        {},
        { timeout: 2000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("2 of 13")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Let's go!" }));
    expect(
      screen.getByText("This flame is your run. Learn a little every day and watch it grow!"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(saveTourAction).toHaveBeenLastCalledWith(null, { finished: true });
    expect(screen.queryByRole("region", { name: "Welcome tour" })).toBeNull();
  });

  it("stays away once finished, and Show me around again starts it from the top", async () => {
    render(<WelcomeTour name="Sam" buddy="nell" show={false} />);
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(screen.queryByRole("region", { name: "Welcome tour" })).toBeNull();

    act(() => startTour());
    expect(
      await screen.findByRole("button", { name: "Pick Nell as your buddy" }),
    ).toBeInTheDocument();
  });
});
