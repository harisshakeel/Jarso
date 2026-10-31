import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JarIllustration } from "./jar-illustration";

afterEach(cleanup);

describe("JarIllustration", () => {
  it("fills to the counted share and stacks the reserved band above it", () => {
    const { container } = render(
      <JarIllustration jar="save" capacityMinor={4500} filledMinor={2600} reservedMinor={500} />,
    );
    expect(container.querySelector("[data-fill]")).toHaveAttribute("data-ratio", "0.578");
    expect(container.querySelector("[data-reserved]")).toHaveAttribute("data-ratio", "0.111");
  });

  it("never fills past the top", () => {
    const { container } = render(
      <JarIllustration jar="spend" capacityMinor={1000} filledMinor={5000} />,
    );
    expect(container.querySelector("[data-fill]")).toHaveAttribute("data-ratio", "1");
  });

  it("keeps the reserved band inside the jar", () => {
    const { container } = render(
      <JarIllustration jar="save" capacityMinor={1000} filledMinor={800} reservedMinor={500} />,
    );
    expect(container.querySelector("[data-reserved]")).toHaveAttribute("data-ratio", "0.2");
  });

  it("draws the goal line only with a goal", () => {
    const { container, rerender } = render(
      <JarIllustration jar="save" capacityMinor={4500} filledMinor={0} goal={null} />,
    );
    expect(container.querySelector("[data-goal-line]")).toBeNull();
    rerender(
      <JarIllustration jar="save" capacityMinor={4500} filledMinor={0} goal={{ emoji: "⚽" }} />,
    );
    expect(container.querySelector("[data-goal-line]")).not.toBeNull();
  });

  it("draws the coin on its way only when money is due", () => {
    const { container } = render(
      <JarIllustration jar="save" capacityMinor={4500} filledMinor={0} dueCoin="£5" />,
    );
    expect(container.querySelector("[data-due-coin]")).toHaveTextContent("£5");
  });

  it("gives each jar its own pattern id", () => {
    const { container } = render(
      <>
        <JarIllustration jar="save" capacityMinor={10} filledMinor={1} reservedMinor={1} />
        <JarIllustration jar="save" capacityMinor={10} filledMinor={1} reservedMinor={1} />
      </>,
    );
    const ids = [...container.querySelectorAll("pattern")].map((p) => p.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("is hidden from screen readers", () => {
    const { container } = render(
      <JarIllustration jar="spend" capacityMinor={10} filledMinor={1} />,
    );
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
