import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeSwitch } from "./theme-switch";

const setTheme = vi.fn();
let resolvedTheme: string | undefined = "dark";
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme, setTheme }) }));

afterEach(() => {
  cleanup();
  setTheme.mockClear();
  resolvedTheme = "dark";
});

describe("ThemeSwitch", () => {
  it("renders a neutral, unnamed-by-theme button before mount", () => {
    const html = renderToString(<ThemeSwitch />);
    expect(html).toContain('aria-label="Theme"');
    expect(html).not.toContain("Switch to");
  });

  it("offers the other theme in its name", () => {
    render(<ThemeSwitch />);
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });

  it("opens no menu", () => {
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole("button", { name: /^Switch to/ }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it.each([
    ["dark", "light"],
    ["light", "dark"],
  ])("one click from %s sets %s", (from, to) => {
    resolvedTheme = from;
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole("button", { name: `Switch to ${to} theme` }));
    expect(setTheme).toHaveBeenCalledWith(to);
  });
});
