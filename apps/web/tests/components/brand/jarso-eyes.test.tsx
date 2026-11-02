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
    // A jar: two eyes, two pupils (and their shine), coins inside, nothing dropping in.
    expect(container.querySelectorAll(".eyes-lids > ellipse")).toHaveLength(2);
    expect(container.querySelectorAll(".eyes-pupils circle")).toHaveLength(4);
    expect(container.querySelector(".jar-pile")).not.toBeNull();
    expect(container.querySelector(".jar-drop")).toBeNull();
    expect(eyes).not.toHaveAttribute("data-filling");
  });

  it("drops coins through the lid while filling, eyes up at them", () => {
    const { container } = render(<JarsoEyes size="lg" look="up" filling />);
    const jar = container.querySelector("[data-jarso-eyes]");
    expect(jar).toHaveAttribute("data-filling");
    expect(jar).toHaveAttribute("data-look", "up");
    expect(container.querySelectorAll(".jar-drop")).toHaveLength(3);
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
