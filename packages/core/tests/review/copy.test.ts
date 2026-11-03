import { describe, expect, it } from "vitest";
import { weekCopy, weekDay, weekSentence } from "../../src/review";

const money = (minor: number) => `£${minor / 100}`;
const week = {
  weekStart: "2026-10-26",
  weekEnd: "2026-11-01",
  receivedMinor: 0,
  spentMinor: 0,
  savedMinor: 0,
  stillDueMinor: 0,
};

describe("week copy", () => {
  it("says the week in a sentence", () => {
    expect(weekSentence({ ...week, receivedMinor: 500, spentMinor: 300 }, money)).toBe(
      "This week £5 came in and you spent £3.",
    );
    expect(weekSentence(week, money)).toBe("No money moved this week.");
  });

  it("formats the edges and the goal lines as the web card did", () => {
    expect(weekCopy.range(weekDay(week.weekStart), weekDay(week.weekEnd))).toBe("26 Oct to 1 Nov");
    expect(`${weekCopy.goalProgress("⚽", "Boots", "£20", "£45")}${weekCopy.paymentsLeft(1)}`).toBe(
      "⚽ Boots: £20 of £45. About 1 allowance to go.",
    );
    expect(weekCopy.paymentsLeft(3)).toBe(" About 3 allowances to go.");
    expect(`${weekCopy.showedYouCan} split money${weekCopy.goodThinking}`).toBe(
      "You showed you can split money. Good thinking.",
    );
  });
});
