import { bodyFor, describeAnswer } from "@jarso/core/learning";
import { checkIn } from "@jarso/core/learning/content";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StepPictureView, stepPictures } from "@/features/learning/components/step-pictures";

afterEach(cleanup);

describe("question pictures", () => {
  it("draws every check-in question, with its own amounts in the family currency", () => {
    for (const question of checkIn.questions) {
      expect(stepPictures[question.key], question.key).toBeDefined();
    }
    const first = checkIn.questions[0];
    if (!first) throw new Error("no check-in");
    render(<StepPictureView stepKey={first.key} prompt={first.prompt} currency="GBP" />);
    const picture = screen.getByRole("img");
    expect(picture).toHaveAccessibleName(/£14 .*£5\.50/);
    expect(picture).toHaveTextContent("£14");
    expect(picture).toHaveTextContent("£5.50");
  });

  it("shows the setup, never the answer", () => {
    for (const question of checkIn.questions) {
      const body = bodyFor(question, "main");
      const answer = describeAnswer(body, "GBP");
      const { unmount } = render(
        <StepPictureView stepKey={question.key} prompt={body.prompt} currency="GBP" />,
      );
      const picture = screen.getByRole("img");
      // A money answer or a worded one must not be drawn or read out.
      if (/£|[a-z]{4,}/i.test(answer)) {
        expect(picture.textContent ?? "", question.key).not.toContain(answer);
        expect(picture.getAttribute("aria-label") ?? "", question.key).not.toContain(answer);
      }
      unmount();
    }
  });

  it("draws nothing for a question without a picture", () => {
    const { container } = render(
      <StepPictureView stepKey="no-such-step" prompt="Hi {m:100}" currency="GBP" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
