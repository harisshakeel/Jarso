import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JarMovesChoice } from "@/features/rules/components/jar-moves-choice";
import { setJarMovesAction } from "@/features/rules/server/actions";

vi.mock("@/features/rules/server/actions", () => ({ setJarMovesAction: vi.fn() }));
vi.mock("@/features/offline", () => ({
  runOnline: (action: () => Promise<unknown>) => action(),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("JarMovesChoice", () => {
  it("offers ask first or just tell me, with the setting as a sentence", () => {
    render(<JarMovesChoice childId="c1" nickname="Sam" mode="ask" />);
    expect(screen.getByText("Sam asks you before moving money between jars")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Ask me first" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Just tell me" })).not.toBeChecked();
  });

  it("saves the new mode for the child and reads it back as a sentence", async () => {
    vi.mocked(setJarMovesAction).mockResolvedValue({ ok: true, data: undefined });
    render(<JarMovesChoice childId="c1" nickname="Sam" mode="ask" />);
    fireEvent.click(screen.getByRole("radio", { name: "Just tell me" }));
    expect(screen.getByText("Sam moves money between jars and you get a note")).toBeVisible();
    await waitFor(() =>
      expect(setJarMovesAction).toHaveBeenCalledWith(null, { childId: "c1", mode: "notify" }),
    );
    expect(screen.getByText(/Asking for extra money still waits for you/)).toBeVisible();
  });

  it("goes back and shows the error when the save fails", async () => {
    vi.mocked(setJarMovesAction).mockResolvedValue({
      ok: false,
      error: { code: "INTERNAL", message: "Failed to save the setting" },
    });
    render(<JarMovesChoice childId="c1" nickname="Sam" mode="notify" />);
    fireEvent.click(screen.getByRole("radio", { name: "Ask me first" }));
    await screen.findByText("Failed to save the setting");
    expect(screen.getByRole("radio", { name: "Just tell me" })).toBeChecked();
  });
});
