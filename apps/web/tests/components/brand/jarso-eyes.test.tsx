import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JarsoEyes } from "@/components/brand/jarso-eyes";

afterEach(cleanup);

describe("JarsoEyes", () => {
  it("is decorative beside visible text, at the asked size, looking ahead", () => {
    const { container } = render(<JarsoEyes size="xl" />);
    const eyes = container.querySelector("[data-jarso-eyes]");
    expect(eyes).toHaveAttribute("aria-hidden", "true");
    expect(eyes).toHaveAttribute("width", "112");
    expect(eyes).toHaveAttribute("data-look", "ahead");
    // Two eyes, two pupils (and their shine): nothing else on the face.
    expect(container.querySelectorAll("ellipse")).toHaveLength(2);
    expect(container.querySelectorAll(".eyes-pupils circle")).toHaveLength(4);
  });

  it("is named for assistive technology when it stands alone, and can look down or around", () => {
    const { rerender } = render(<JarsoEyes label="Jarso" look="down" />);
    expect(screen.getByRole("img", { name: "Jarso" })).toHaveAttribute("data-look", "down");
    rerender(<JarsoEyes label="Jarso" look="around" size="sm" />);
    const eyes = screen.getByRole("img", { name: "Jarso" });
    expect(eyes).toHaveAttribute("data-look", "around");
    expect(eyes).toHaveAttribute("width", "20");
  });
});
