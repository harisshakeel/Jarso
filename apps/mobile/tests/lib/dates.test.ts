import { todayLine } from "@/lib";

describe("todayLine", () => {
  it("todayLine names the family's day", () => {
    expect(todayLine(new Date("2026-11-03T23:30:00Z"), "Asia/Kolkata")).toBe(
      "Wednesday 4 November",
    );
    expect(todayLine(new Date("2026-11-03T09:00:00Z"), "Europe/London")).toBe("Tuesday 3 November");
  });
});
