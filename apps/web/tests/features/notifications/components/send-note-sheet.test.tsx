import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SendNoteSheet } from "@/features/notifications/components/send-note-sheet";

const { sendChildNoteAction, success } = vi.hoisted(() => ({
  sendChildNoteAction: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@/features/notifications/server/actions", () => ({ sendChildNoteAction }));
vi.mock("@/features/offline", async (original) => ({
  ...(await original<typeof import("@/features/offline")>()),
  runOnline: (action: () => Promise<unknown>) => action(),
}));
vi.mock("sonner", () => ({ toast: { success } }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

/** A full run is busy; the sheet opens and the action settles over a few frames. */
const wait = { timeout: 5_000 };

function open(suggestions: readonly string[] = ["Great saving! 🎉"]) {
  render(<SendNoteSheet childId="child-1" nickname="Aisha" suggestions={suggestions} />);
  fireEvent.click(screen.getByRole("button", { name: "Send a note to Aisha" }));
}

describe("SendNoteSheet", () => {
  it("starts from a ready line and sends the note only on Send", async () => {
    sendChildNoteAction.mockResolvedValue({ ok: true, data: { status: "sent" } });
    open();
    expect(await screen.findByText("A note for Aisha", {}, wait)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Great saving! 🎉" }));
    const input = screen.getByLabelText("Your note");
    expect(input).toHaveValue("Great saving! 🎉");
    expect(sendChildNoteAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Send to Aisha" }));
    await vi.waitFor(() => expect(success).toHaveBeenCalledWith("Note sent to Aisha"), wait);
    const form = sendChildNoteAction.mock.calls[0]?.[1] as FormData;
    expect(form.get("childId")).toBe("child-1");
    expect(form.get("text")).toBe("Great saving! 🎉");
    expect(String(form.get("idempotencyKey"))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("shows why a note didn't go, and keeps what was written", async () => {
    sendChildNoteAction.mockResolvedValue({
      ok: false,
      error: { code: "RATE_LIMITED", message: "That's a lot of notes today. Send more tomorrow." },
    });
    open([]);
    const input = await screen.findByLabelText("Your note", {}, wait);
    fireEvent.change(input, { target: { value: "See you soon" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to Aisha" }));
    expect(
      await screen.findByText("That's a lot of notes today. Send more tomorrow.", {}, wait),
    ).toBeVisible();
    expect(screen.getByLabelText("Your note")).toHaveValue("See you soon");
    expect(success).not.toHaveBeenCalled();
  });
});
