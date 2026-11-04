import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CelebrationHost,
  celebrate,
  currentCelebration,
  resetCelebrationsForTests,
} from "@/components/celebrate";

const { playCoins, playRight } = vi.hoisted(() => ({ playCoins: vi.fn(), playRight: vi.fn() }));
vi.mock("@/lib", async (original) => ({
  ...(await original<typeof import("@/lib")>()),
  playCoins,
  playRight,
}));

afterEach(() => {
  cleanup();
  act(() => resetCelebrationsForTests());
  vi.clearAllMocks();
});

describe("CelebrationHost", () => {
  it("shows a celebration as a named dialog and closes on Done", async () => {
    render(<CelebrationHost />);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() =>
      celebrate({
        icon: "gift",
        title: "Gift on its way",
        amount: "£10",
        body: "Sam will see it today.",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Gift on its way" });
    expect(dialog).toHaveTextContent("£10");
    expect(dialog).toHaveAccessibleDescription("Sam will see it today.");
    expect(playCoins).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(currentCelebration()).toBeNull();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("queues a second one behind the first, with its own button and a bell", async () => {
    render(<CelebrationHost />);
    act(() => {
      celebrate({ title: "Approved" });
      celebrate({ icon: "target", title: "Goal set!", doneLabel: "Let's go" });
    });
    expect(await screen.findByRole("dialog", { name: "Approved" })).toBeInTheDocument();
    expect(playRight).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("dialog", { name: "Goal set!" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Let's go" })).toBeInTheDocument();
    expect(playRight).toHaveBeenCalledTimes(2);
  });
});
