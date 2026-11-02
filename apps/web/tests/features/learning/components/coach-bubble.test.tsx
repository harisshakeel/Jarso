import { coaches } from "@jarso/core/learning";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Blackboard } from "@/features/learning/components/blackboard";
import { CoachBubble } from "@/features/learning/components/coach-bubble";

afterEach(cleanup);

describe("CoachBubble", () => {
  it("shows the coach, its name and its idle line before the child answers", () => {
    const { container } = render(<CoachBubble coach={coaches.bo} hints={[]} currency="GBP" />);
    expect(screen.getByText("Bo")).toBeVisible();
    expect(screen.getByText("Take your time.")).toBeVisible();
    expect(container.querySelector('[data-coach="bo"]')).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("list", { name: "Hints" })).toBeNull();
  });

  it("hands out the hints with the coach's hint line and renders money in them", () => {
    render(
      <CoachBubble
        coach={coaches.zuzu}
        hints={["Look at the price.", "Compare it with {m:900}."]}
        currency="GBP"
      />,
    );
    expect(screen.getByText("Psst. Here's a hint.")).toBeVisible();
    expect(screen.getByRole("list", { name: "Hints" })).toHaveTextContent(
      "Look at the price.Compare it with £9.",
    );
  });

  it("carries the feedback in a live region and reacts to the answer", () => {
    const { container } = render(
      <CoachBubble coach={coaches.pip} hints={[]} currency="GBP" reaction="cheer">
        <h3>That's it.</h3>
      </CoachBubble>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("That's it.");
    expect(screen.queryByText("Let's look closely.")).toBeNull();
    expect(container.querySelector('[data-coach="pip"]')).toHaveAttribute("data-reaction", "cheer");
  });

  it("keeps the check-in free of hints and right or wrong", () => {
    render(<CoachBubble coach={coaches.nell} hints={["A hint"]} currency="GBP" checkIn />);
    expect(screen.getByText("Whatever you think is fine.")).toBeVisible();
    expect(screen.queryByRole("list", { name: "Hints" })).toBeNull();
  });
});

describe("Blackboard", () => {
  it("writes the step, the question and a note on the board", () => {
    render(<Blackboard eyebrow="Step 3 of 7" promptId="q" prompt="What is left?" note="Think." />);
    expect(screen.getByText("Step 3 of 7")).toBeVisible();
    expect(screen.getByRole("heading", { name: "What is left?" })).toHaveAttribute("id", "q");
    expect(screen.getByText("Think.")).toBeVisible();
  });
});
