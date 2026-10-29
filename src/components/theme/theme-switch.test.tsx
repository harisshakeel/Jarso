import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeSwitch } from "./theme-switch";

const setTheme = vi.fn();
let theme = "dark";
vi.mock("next-themes", () => ({ useTheme: () => ({ theme, setTheme }) }));

afterEach(() => {
  cleanup();
  setTheme.mockClear();
  theme = "dark";
});

async function openMenu() {
  const trigger = screen.getByRole("button", { name: /^Theme/ });
  fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
  fireEvent.mouseDown(trigger, { button: 0 });
  fireEvent.pointerUp(trigger, { button: 0, pointerType: "mouse" });
  fireEvent.click(trigger);
  await screen.findByRole("menu");
}

describe("ThemeSwitch", () => {
  it("renders a neutral, unnamed-by-theme button before mount", () => {
    const html = renderToString(<ThemeSwitch />);
    expect(html).toContain('aria-label="Theme"');
    expect(html).not.toContain("Theme:");
  });

  it("names the button with the current choice", () => {
    render(<ThemeSwitch />);
    expect(screen.getByRole("button", { name: "Theme: Dark" })).toBeInTheDocument();
  });

  it("falls back to System when no choice is stored", () => {
    theme = "";
    render(<ThemeSwitch />);
    expect(screen.getByRole("button", { name: "Theme: System" })).toBeInTheDocument();
  });

  it("offers three radio options and marks the selected one", async () => {
    render(<ThemeSwitch />);
    await openMenu();
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(3);
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toBeChecked();
    expect(screen.getByRole("menuitemradio", { name: "Light" })).not.toBeChecked();
    expect(screen.getByRole("menuitemradio", { name: "System" })).not.toBeChecked();
  });

  it.each([
    ["Light", "light"],
    ["Dark", "dark"],
    ["System", "system"],
  ])("selecting %s calls setTheme(%s)", async (label, value) => {
    // Start from a different theme so Dark is a real change too.
    theme = value === "dark" ? "light" : "dark";
    render(<ThemeSwitch />);
    await openMenu();
    fireEvent.click(screen.getByRole("menuitemradio", { name: label }));
    expect(setTheme).toHaveBeenCalledWith(value);
  });
});
