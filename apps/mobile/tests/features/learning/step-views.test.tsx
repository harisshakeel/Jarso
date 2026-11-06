import type { Draft, StepBody } from "@jarso/core/learning";
import { inputCopy } from "@jarso/core/learning";
import { findMission } from "@jarso/core/learning/content";
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

const buy = findMission("whats-in-spend")?.steps.find((step) => step.key === "which-can-you-buy");

function renderBuy(onChange = jest.fn(), disabled = false) {
  return render(
    <StepInput
      body={buy as unknown as StepBody}
      draft={{ kind: "option", optionId: null } as unknown as Draft}
      onChange={onChange}
      currency="GBP"
      disabled={disabled}
      idBase="t"
    />,
  );
}

describe("choice options on the phone", () => {
  it("choice options show as picture tiles named by their text", async () => {
    await renderBuy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /comic/i })).toBeOnTheScreen();
    expect(screen.getByText("📖", { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it("pressing a tile selects that option", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    await renderBuy(onChange);
    await user.press(screen.getByRole("radio", { name: /comic/i }));
    expect(onChange).toHaveBeenCalledWith({ kind: "option", optionId: "comic" });
  });

  it("locked tiles ignore presses", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    await renderBuy(onChange, true);
    await user.press(screen.getByRole("radio", { name: /comic/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
