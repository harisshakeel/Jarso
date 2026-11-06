import { render, screen } from "@testing-library/react-native";
import { GoalRing, MilestoneStars } from "@/features/goals";

describe("GoalRing", () => {
  it("ring with a label is a progressbar at the right value", async () => {
    await render(<GoalRing emoji="⚽" value={0.756} label="Football boots, 76%" />);
    const bar = screen.getByRole("progressbar", { name: "Football boots, 76%" });
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 76 });
    expect(screen.getByText("⚽")).toBeOnTheScreen();
  });

  it("ring clamps overshoot to 100", async () => {
    await render(<GoalRing emoji="⚽" value={1.4} label="Done" />);
    expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(100);
  });

  it("ring without a label is hidden from screen readers", async () => {
    await render(<GoalRing emoji="⚽" value={0.5} />);
    expect(screen.queryByRole("progressbar")).not.toBeOnTheScreen();
    expect(screen.getByTestId("goal-ring", { includeHiddenElements: true }).props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants",
    });
  });
});

describe("MilestoneStars", () => {
  it("stars light up to the count and the trophy lights at 4", async () => {
    const { rerender } = await render(<MilestoneStars lit={2} />);
    expect(screen.getByLabelText("2 of 4 stars")).toBeOnTheScreen();
    const gold = (id: string) => screen.getByTestId(id).props.style.backgroundColor;
    expect(gold("star-1")).toBe(gold("star-2"));
    expect(gold("star-3")).toBe(gold("trophy"));
    expect(gold("star-1")).not.toBe(gold("star-3"));
    await rerender(<MilestoneStars lit={4} />);
    expect(screen.getByLabelText("4 of 4 stars")).toBeOnTheScreen();
    expect(gold("trophy")).toBe(gold("star-1"));
  });

  it("stars appear without animation under reduced motion", async () => {
    const reanimated = require("react-native-reanimated");
    const spy = jest.spyOn(reanimated, "useReducedMotion").mockReturnValue(true);
    try {
      await render(<MilestoneStars lit={1} />);
      expect(screen.getByTestId("star-1").props.entering).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it("stars animate in otherwise", async () => {
    await render(<MilestoneStars lit={1} />);
    expect(screen.getByTestId("star-1").props.entering).toBeDefined();
  });
});
