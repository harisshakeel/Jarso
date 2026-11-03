import { missions, reviewPool } from "@jarso/core/learning/content";
import {
  type Client,
  getLearningOverview,
  getMissionSession,
  getPracticeSet,
} from "@jarso/data/learning";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/learning/repository", () => ({
  findCheckIn: vi.fn(),
  findLastActivity: vi.fn(),
  listActivity: vi.fn(),
  listAttempts: vi.fn(),
  listPracticeHistory: vi.fn(),
  listReviewItems: vi.fn(),
  listSkillProgress: vi.fn(),
  listStepResults: vi.fn(),
}));
const repo = await import("../../src/learning/repository");

const db = {} as Client;
const childId = "child-1";
// Wednesday 4 November 2026, mid-morning in London.
const now = new Date("2026-11-04T10:00:00Z");
const clock = { timezone: "Europe/London", now };
const first = missions[0];
const second = missions[1];
if (!first || !second) throw new Error("missing missions");

const attempt = (over: Partial<Awaited<ReturnType<typeof repo.listAttempts>>[number]> = {}) => ({
  id: "attempt-1",
  childId,
  missionKey: first.key,
  contentVersion: first.version,
  status: "started" as const,
  startedAt: "2026-11-03T09:00:00Z",
  completedAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.listAttempts).mockResolvedValue([]);
  vi.mocked(repo.listSkillProgress).mockResolvedValue([]);
  vi.mocked(repo.listReviewItems).mockResolvedValue([]);
  vi.mocked(repo.findCheckIn).mockResolvedValue(null);
  vi.mocked(repo.listActivity).mockResolvedValue([]);
  vi.mocked(repo.findLastActivity).mockResolvedValue(null);
  vi.mocked(repo.listStepResults).mockResolvedValue(new Map());
  vi.mocked(repo.listPracticeHistory).mockResolvedValue([]);
});

describe("getLearningOverview", () => {
  it("asks for the check-in first, then mission 1", async () => {
    const overview = await getLearningOverview(db, childId, clock);
    expect(overview.nextStep).toEqual({ kind: "check-in" });
    expect(overview.journey[0]?.status).toBe("current");
  });

  it("reads the week with a day of slack, from the family's own today", async () => {
    await getLearningOverview(db, childId, clock);
    // The week starts Monday 2 November; a day earlier in UTC covers every timezone.
    expect(repo.listActivity).toHaveBeenCalledWith(db, childId, "2026-11-01T00:00:00Z");
  });

  it("counts practice due today and lists finished missions newest first", async () => {
    vi.mocked(repo.listReviewItems).mockResolvedValue([
      { skillKey: "balance.afford", box: 1, dueOn: "2026-11-04" },
      { skillKey: "balance.running_total", box: 1, dueOn: "2026-11-05" },
    ]);
    vi.mocked(repo.listAttempts).mockResolvedValue([
      attempt({ id: "a1", status: "completed", completedAt: "2026-11-02T09:00:00Z" }),
      attempt({
        id: "a2",
        missionKey: second.key,
        status: "completed",
        completedAt: "2026-11-03T23:30:00Z",
      }),
    ]);
    const overview = await getLearningOverview(db, childId, clock);
    expect(overview.practiceDue).toBe(1);
    expect(overview.completed.map((c) => [c.attemptId, c.completedOn])).toEqual([
      ["a2", "2026-11-03"],
      ["a1", "2026-11-02"],
    ]);
  });
});

describe("getMissionSession", () => {
  it("is null for an unknown mission and a locked one", async () => {
    await expect(getMissionSession(db, childId, "no-such-mission", { now })).resolves.toBeNull();
    await expect(getMissionSession(db, childId, second.key, { now })).resolves.toBeNull();
  });

  it("is empty before the child starts", async () => {
    await expect(getMissionSession(db, childId, first.key, { now })).resolves.toEqual({
      attemptId: null,
      results: [],
    });
  });

  it("resumes the open attempt of this content version only", async () => {
    vi.mocked(repo.listAttempts).mockResolvedValue([
      attempt({ id: "old", contentVersion: first.version - 1 }),
      attempt({ id: "open" }),
    ]);
    const results = [
      { stepKey: "s", phase: "main" as const, correct: true, hintsUsed: 0, tries: 1 },
    ];
    vi.mocked(repo.listStepResults).mockResolvedValue(new Map([["open", results]]));
    await expect(getMissionSession(db, childId, first.key, { now })).resolves.toEqual({
      attemptId: "open",
      results,
    });
    expect(repo.listStepResults).toHaveBeenCalledWith(db, ["open"]);
  });
});

describe("getPracticeSet", () => {
  it("is empty when nothing is due", async () => {
    vi.mocked(repo.listReviewItems).mockResolvedValue([
      { skillKey: "balance.afford", box: 1, dueOn: "2026-11-05" },
    ]);
    await expect(getPracticeSet(db, childId, clock)).resolves.toEqual([]);
    expect(repo.listPracticeHistory).toHaveBeenCalledWith(db, childId, "2026-09-05");
  });

  it("picks items for due skills", async () => {
    const skill = reviewPool[0]?.skill;
    if (!skill) throw new Error("missing review item");
    vi.mocked(repo.listReviewItems).mockResolvedValue([
      { skillKey: skill, box: 1, dueOn: "2026-11-04" },
    ]);
    const set = await getPracticeSet(db, childId, clock);
    expect(set.length).toBeGreaterThan(0);
    expect(set.every((item) => item.skill === skill)).toBe(true);
  });
});
