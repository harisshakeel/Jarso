import { type Client, getWeeklyReview } from "@jarso/data/learning";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/learning/repository", () => ({
  findCheckIn: vi.fn(async () => null),
  findLastActivity: vi.fn(async () => null),
  listActivity: vi.fn(async () => []),
  listAttempts: vi.fn(async () => []),
  listRecentPracticeKeys: vi.fn(async () => []),
  listReviewItems: vi.fn(async () => []),
  listSkillProgress: vi.fn(async () => []),
  listStepResults: vi.fn(async () => new Map()),
}));
vi.mock("@jarso/data/ledger", () => ({ getHistorySince: vi.fn(async () => []) }));
vi.mock("@jarso/data/allowance", () => ({
  sumDueOccurrences: vi.fn(async () => ({ totalMinor: 500, count: 1 })),
}));
vi.mock("@jarso/data/goals", () => ({ getGoalView: vi.fn(async () => null) }));

const repo = await import("../../src/learning/repository");
const ledger = await import("@jarso/data/ledger");

const db = {} as Client;
const now = new Date("2026-11-04T10:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("getWeeklyReview", () => {
  it("reads the family's week and builds the review", async () => {
    const review = await getWeeklyReview(db, "c1", {
      timezone: "Europe/London",
      currency: "GBP",
      now,
    });
    expect(ledger.getHistorySince).toHaveBeenCalledWith(db, "c1", "2026-11-02", {
      timezone: "Europe/London",
      now: now.getTime(),
    });
    expect(repo.listRecentPracticeKeys).toHaveBeenCalledWith(db, "c1", "2026-10-21");
    expect(review.goal).toEqual({ kind: "none" });
    expect(review.money).toBeTruthy();
  });
});
