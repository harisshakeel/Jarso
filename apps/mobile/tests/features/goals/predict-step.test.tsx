import { PREDICT_QUESTION } from "@jarso/core/goals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { JarsoGuess, PredictStep } from "@/features/goals";

const goal = { name: "Boots", emoji: "⚽", targetMinor: 10000, planMinor: 1000 };
const base = { move: "put_in" as const, goal, saveMinor: 2000, reservedMinor: 0 };

describe("JarsoGuess", () => {
  it("asks once an amount is typed", async () => {
    await render(<JarsoGuess {...base} amountMinor={1000} />);
    expect(screen.getByText("⚽ Your goal gets…")).toBeTruthy();
    expect(screen.getByLabelText("Further")).toBeTruthy();
    expect(screen.getByLabelText("Closer")).toBeTruthy();
  });

  it("a right guess cheers", async () => {
    await render(<JarsoGuess {...base} amountMinor={1000} />);
    await fireEvent.press(screen.getByLabelText("Closer"));
    expect(screen.getByText(/Yes! 1 allowance closer\./)).toBeTruthy();
  });

  it("a wrong guess is calm", async () => {
    await render(<JarsoGuess {...base} amountMinor={1000} />);
    await fireEvent.press(screen.getByLabelText("Further"));
    expect(screen.getByText(/Good guess! 1 allowance closer\./)).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toContain("text-destructive");
  });

  it("resets when the amount changes", async () => {
    const { rerender } = await render(<JarsoGuess {...base} amountMinor={1000} />);
    await fireEvent.press(screen.getByLabelText("Closer"));
    await rerender(<JarsoGuess {...base} amountMinor={2000} />);
    expect(screen.queryByText(/Yes!/)).toBeNull();
  });

  it("hidden when nothing changes", async () => {
    await render(<JarsoGuess {...base} saveMinor={20000} amountMinor={1000} />);
    expect(screen.queryByLabelText("Closer")).toBeNull();
    await render(<JarsoGuess {...base} amountMinor={null} />);
    expect(screen.queryByLabelText("Closer")).toBeNull();
  });
});

describe("PredictStep", () => {
  it("still renders for change_plan", async () => {
    await render(
      <PredictStep
        move="change_plan"
        amountMinor={500}
        goal={goal}
        saveMinor={2000}
        reservedMinor={0}
        currency="INR"
        maxMinor={5000}
      />,
    );
    expect(screen.getByText(`⚽ ${PREDICT_QUESTION.change_plan}`)).toBeTruthy();
  });
});
