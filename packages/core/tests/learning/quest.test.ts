import { chestReward, currentQuestWeek, questCopy, questMap } from "@jarso/core/learning";
import { describe, expect, it } from "vitest";

type S = "done" | "current" | "locked";
function journey(statuses: S[]) {
  return statuses.map((status, i) => ({
    key: `m${i + 1}`,
    day: i + 1,
    title: `Mission ${i + 1}`,
    status,
  }));
}
const seven = (done: number): S[] =>
  Array.from({ length: 7 }, (_, i) => (i < done ? "done" : i === done ? "current" : "locked"));
function first(...args: Parameters<typeof questMap>) {
  const w = questMap(...args)[0];
  if (!w) throw new Error("no week");
  return w;
}
function at<T>(items: readonly T[], i: number): T {
  const item = items[i];
  if (item === undefined) throw new Error(`no item ${i}`);
  return item;
}
const words = (s: string) => s.trim().split(/\s+/).length;

describe("questMap", () => {
  it("seven missions make one week of seven stops with the chest after the last", () => {
    const weeks = questMap(journey(seven(0)));
    expect(weeks).toHaveLength(1);
    expect(at(weeks, 0).stops).toHaveLength(7);
    expect(at(weeks, 0).week).toBe(1);
    expect(at(weeks, 0).chest.y).toBe(at(at(weeks, 0).stops, 6).y + 96);
    expect(at(weeks, 0).chest.x).toBe(162);
  });

  it("eight missions make two weeks (7 + 1)", () => {
    const weeks = questMap(journey([...seven(7), "current"]));
    expect(weeks.map((w) => w.stops.length)).toEqual([7, 1]);
    expect(at(weeks, 1).week).toBe(2);
  });

  it("fewer than seven: the chest follows the last stop and total is n", () => {
    const w = first(journey(["done", "current", "locked"]));
    expect(w.total).toBe(3);
    expect(w.chest.y).toBe(at(w.stops, 2).y + 96);
  });

  it("an empty journey has no weeks", () => {
    expect(questMap([])).toEqual([]);
  });

  it("Jarso stands on the now stop", () => {
    const w = first(journey(["done", "done", "current", "locked", "locked", "locked", "locked"]));
    expect(w.jarso.on).toBe("stop");
    expect(w.jarso.day).toBe(3);
    expect(w.done).toBe(2);
    expect(w.chest.open).toBe(false);
  });

  it("all done: no now stop, Jarso at an open chest", () => {
    const w = first(journey(Array<S>(7).fill("done")));
    expect(w.stops.some((s) => s.state === "now")).toBe(false);
    expect(w.jarso.on).toBe("chest");
    expect(w.jarso.day).toBeNull();
    expect(w.jarso.y).toBe(w.chest.y);
    expect(w.chest.open).toBe(true);
  });

  it("the path winds: neighbouring stops never share an x", () => {
    for (const width of [280, 324, 400]) {
      const w = first(journey(seven(0)), { width });
      for (let i = 1; i < w.stops.length; i++)
        expect(at(w.stops, i).x).not.toBe(at(w.stops, i - 1).x);
    }
  });

  it("every stop fits inside the width", () => {
    for (const width of [280, 400]) {
      const w = first(journey(seven(0)), { width });
      for (const s of [...w.stops, w.chest, w.jarso]) {
        expect(s.x).toBeGreaterThanOrEqual(32);
        expect(s.x).toBeLessThanOrEqual(width - 32);
      }
    }
  });

  it("pathD starts at stop 0 and has one curve per hop", () => {
    const w = first(journey(seven(0)));
    expect(w.pathD.startsWith(`M ${at(w.stops, 0).x} ${at(w.stops, 0).y}`)).toBe(true);
    expect(w.pathD.match(/C/g)).toHaveLength(7);
  });

  it("currentQuestWeek picks the week with the now stop, else the last", () => {
    const weeks = questMap(journey([...seven(7), "current"]));
    expect(currentQuestWeek(weeks)?.week).toBe(2);
    const first = questMap(journey([...seven(3), ...Array<S>(7).fill("locked")]));
    expect(currentQuestWeek(first)?.week).toBe(1);
    const finished = questMap(journey(Array<S>(9).fill("done")));
    expect(currentQuestWeek(finished)?.week).toBe(2);
    expect(currentQuestWeek([])).toBeNull();
  });
});

describe("chestReward", () => {
  it("chest reward is a badge and a look, never money", () => {
    const r = chestReward(1, { badges: [], level: 1 });
    expect(Object.keys(r).sort()).toEqual(["badge", "earned", "wear"]);
    expect(r.earned).toBe(false);
    expect(chestReward(1, { badges: ["missions_5"], level: 1 }).earned).toBe(true);
    expect(r.wear).toBe("cap");
    expect(chestReward(1, { badges: [], level: 5 }).wear).toBe("crown");
    expect(chestReward(2, { badges: [], level: 1 }).badge).toBe("missions_10");
    expect(chestReward(9, { badges: [], level: 1 }).badge).toBe("missions_10");
  });
});

describe("questCopy", () => {
  it("quest copy stays inside the word budget", () => {
    const labels = [
      questCopy.heading,
      questCopy.week(1),
      questCopy.count(3, 7),
      questCopy.chest,
      questCopy.checkin.eyebrow,
    ];
    for (const l of labels) expect(words(l)).toBeLessThanOrEqual(3);
    const lines = [
      questCopy.today(3),
      questCopy.allDone,
      questCopy.chestLocked,
      questCopy.chestOpen,
      questCopy.playStop(3, "Small buys add up"),
      ...Object.values(questCopy.sheet),
    ];
    for (const l of lines) expect(words(l)).toBeLessThanOrEqual(8);
    for (const l of [...labels, ...lines]) expect(l).not.toMatch(/wrong|lost|fail/i);
  });
});
