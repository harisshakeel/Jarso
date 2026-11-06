import { playerCopy, questCopy, type StepBody } from "@jarso/core/learning";
import { render, screen, userEvent } from "@testing-library/react-native";
import { AnswerSheet } from "@/features/learning/answer-sheet";
import { playSound } from "@/lib/sound";
import { read } from "../../source-files";

jest.mock("@/lib/sound", () => ({ playSound: jest.fn() }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
const body = {
  type: "choice",
  skill: "spending",
  prompt: "Which?",
  options: [
    { id: "a", text: "Apple", feedback: "Nope" },
    { id: "b", text: "Pear", feedback: "Yes" },
  ],
  answer: "b",
  hints: [],
  correct: "Yes",
} as unknown as StepBody;

function sheet(correct: boolean, final: boolean, extra: Record<string, unknown> = {}) {
  return (
    <AnswerSheet
      outcome={{ correct, final, feedback: "Because." }}
      body={body}
      currency="GBP"
      pending={false}
      onContinue={jest.fn()}
      onTryAgain={jest.fn()}
      {...extra}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AnswerSheet", () => {
  it("right answer: green sheet, Nailed it!, Continue, one pop", async () => {
    await render(sheet(true, true));
    expect(screen.getByRole("header", { name: questCopy.sheet.right })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: playerCopy.continue })).toBeOnTheScreen();
    expect(screen.getAllByTestId("confetti-piece", { includeHiddenElements: true })).toHaveLength(
      16,
    );
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledWith("pop");
  });

  it("wrong answer: calm blue sheet says Close! Try again and offers Try again", async () => {
    const onTryAgain = jest.fn();
    const user = userEvent.setup();
    await render(sheet(false, false, { onTryAgain }));
    expect(screen.getByRole("header", { name: questCopy.sheet.wrong })).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: playerCopy.tryAgain }));
    expect(onTryAgain).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: playerCopy.continue })).toBeNull();
  });

  it("the wrong sheet never uses red", async () => {
    const { toJSON } = await render(sheet(false, true));
    expect(JSON.stringify(toJSON())).not.toMatch(/destructive|red/);
    const source = read("src/features/learning/answer-sheet.tsx");
    expect(source).not.toContain("destructive");
    expect(source).not.toContain("red-");
  });

  it("second wrong shows the answer line and Continue", async () => {
    const onContinue = jest.fn();
    const user = userEvent.setup();
    await render(sheet(false, true, { onContinue }));
    expect(screen.getByRole("header", { name: questCopy.sheet.shown })).toBeOnTheScreen();
    expect(screen.getByText(playerCopy.answerLine("Pear"))).toBeOnTheScreen();
    await user.press(screen.getByRole("button", { name: playerCopy.continue }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("wrong answer plays no sound", async () => {
    await render(sheet(false, false));
    expect(playSound).not.toHaveBeenCalled();
  });

  it("reduced motion: no confetti nodes", async () => {
    const spy = jest
      .spyOn(require("react-native-reanimated"), "useReducedMotion")
      .mockReturnValue(true);
    try {
      await render(sheet(true, true));
      expect(
        screen.queryAllByTestId("confetti-piece", { includeHiddenElements: true }),
      ).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });
});
