import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusChip } from "./status-chip";

afterEach(cleanup);

describe("StatusChip", () => {
  it("always shows a word next to the icon", () => {
    const { container } = render(<StatusChip status="due" />);
    expect(screen.getByText("Due")).toBeInTheDocument();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden");
  });

  it("uses the caller's label when given", () => {
    render(<StatusChip status="due" label="Due Friday" />);
    expect(screen.getByText("Due Friday")).toBeInTheDocument();
  });

  it("never uses destructive red for closed requests", () => {
    const { container } = render(<StatusChip status="closed" />);
    expect(container.firstElementChild?.className).not.toMatch(/destructive/);
  });
});
