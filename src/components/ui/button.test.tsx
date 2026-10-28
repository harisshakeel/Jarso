import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./button";

afterEach(cleanup);

describe("Button loading state", () => {
  it("is busy and disabled while loading", () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
  });

  it("keeps the label in the DOM, hidden, so the width does not change", () => {
    render(<Button loading>Save</Button>);
    const label = screen.getByText("Save");
    expect(label).toHaveAttribute("data-slot", "button-label");
    expect(label).toHaveClass("opacity-0");
    expect(screen.getByRole("button").querySelector("svg.animate-spin")).not.toBeNull();
  });

  it("renders plainly when not loading", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button).toBeEnabled();
    expect(button.querySelector("svg")).toBeNull();
  });
});
