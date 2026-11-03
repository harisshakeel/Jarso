import type { Draft, StepBody } from "@jarso/core/learning";
import { inputCopy } from "@jarso/core/learning";
import { render, screen, userEvent } from "@testing-library/react-native";
import { useState } from "react";
import { StepInput } from "@/features/learning/step-views";

const split = {
  type: "split",
  skill: "split.basic",
  prompt: "Split {m:1000}",
  total: 1000,
  increment: 100,
  hints: [],
} as unknown as StepBody;

function Harness() {
  const [draft, setDraft] = useState<Draft>({ kind: "split", save: 0 });
  return (
    <StepInput
      body={split}
      draft={draft}
      onChange={setDraft}
      currency="GBP"
      disabled={false}
      idBase="t"
    />
  );
}

describe("split input on the phone", () => {
  it("names the stepper and its buttons, not a slider", async () => {
    const user = userEvent.setup();
    await render(<Harness />);
    expect(screen.getByText(inputCopy.splitLabelStepper)).toBeOnTheScreen();
    expect(screen.queryByText(inputCopy.splitLabel)).toBeNull();
    await user.press(screen.getByRole("button", { name: inputCopy.saveMore }));
    expect(screen.getByText("£1")).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: inputCopy.saveLess }));
    expect(screen.getAllByText("£0").length).toBeGreaterThan(0);
  });
});
