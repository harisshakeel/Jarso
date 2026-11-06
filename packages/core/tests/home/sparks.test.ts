import type { Progress } from "@jarso/core/progress";
import { describe, expect, it } from "vitest";
import { sparkChips } from "../../src/home";

const progress = (sparks: number, streak: number) => ({ sparks, streak }) as Progress;

describe("sparkChips", () => {
  it("shows the gain and the streak", () =>
    expect(sparkChips(progress(10, 2), progress(15, 3))).toEqual([
      { icon: "zap", label: "+5" },
      { icon: "flame", label: "3 days" },
    ]));
  it("no zap without a before", () => expect(sparkChips(undefined, progress(15, 0))).toEqual([]));
  it("no zap when sparks did not move (daily cap)", () =>
    expect(sparkChips(progress(15, 2), progress(15, 2))).toEqual([
      { icon: "flame", label: "2 days" },
    ]));
  it("1 day not 1 days", () =>
    expect(sparkChips(undefined, progress(1, 1))).toEqual([{ icon: "flame", label: "1 day" }]));
  it("nothing for a missing after", () =>
    expect(sparkChips(progress(1, 1), undefined)).toEqual([]));
});
