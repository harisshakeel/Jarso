import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SoundsToggle } from "@/components/sounds/sounds-toggle";
import { resetSoundsForTests, SOUNDS_KEY } from "@/lib/sounds";

beforeEach(() => {
  window.localStorage.clear();
  resetSoundsForTests();
});
afterEach(cleanup);

describe("SoundsToggle", () => {
  it("shows sounds on, and switches them off for this browser", () => {
    render(<SoundsToggle />);
    const toggle = screen.getByRole("switch", { name: "Sounds" });
    expect(toggle).toBeChecked();
    expect(screen.getByText(/Coins clink/)).toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(window.localStorage.getItem(SOUNDS_KEY)).toBe("off");
    expect(screen.getByText("Jarso is quiet on this device.")).toBeVisible();
  });

  it("starts off when the browser remembers off", () => {
    window.localStorage.setItem(SOUNDS_KEY, "off");
    render(<SoundsToggle />);
    expect(screen.getByRole("switch", { name: "Sounds" })).not.toBeChecked();
  });
});
