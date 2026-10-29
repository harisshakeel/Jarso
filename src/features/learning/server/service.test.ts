import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/features/family/server", () => ({
  assertRole: vi.fn(),
  assertSelfOrParentOf: vi.fn(),
  getFamily: vi.fn(),
}));
vi.mock("./repository", () => ({
  completeCheckIn: vi.fn(),
  completeMission: vi.fn(),
  findAttempt: vi.fn(),
  findCheckIn: vi.fn(),
  listActivity: vi.fn(),
  listAttempts: vi.fn(),
  listPracticeHistory: vi.fn(),
  listReviewItems: vi.fn(),
  listSkillProgress: vi.fn(),
  listStepResults: vi.fn(),
  recordPracticeResult: vi.fn(),
  recordStepResult: vi.fn(),
  startMission: vi.fn(),
}));

const family = await import("@/features/family/server");
const repo = await import("./repository");
const service = await import("./service");
const content = await import("../content");

const child = { id: "child-1", email: null };
const firstMission = content.missions[0];
if (!firstMission) throw new Error("missing mission 1");
const attempt = {
  id: "attempt-1",
  childId: child.id,
  missionKey: firstMission.key,
  contentVersion: firstMission.version,
  status: "started" as const,
  startedAt: "2026-10-30T09:00:00Z",
  completedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(family.assertRole).mockResolvedValue({ user: child as never, membership: null });
  vi.mocked(family.assertSelfOrParentOf).mockResolvedValue(child as never);
  vi.mocked(family.getFamily).mockResolvedValue({
    id: "fam-1",
    code: "ABC234",
    currency: "GBP",
    timezone: "Europe/London",
  });
  vi.mocked(repo.listAttempts).mockResolvedValue([]);
  vi.mocked(repo.listSkillProgress).mockResolvedValue([]);
  vi.mocked(repo.listReviewItems).mockResolvedValue([]);
  vi.mocked(repo.findCheckIn).mockResolvedValue(null);
  vi.mocked(repo.listActivity).mockResolvedValue([]);
  vi.mocked(repo.listStepResults).mockResolvedValue(new Map());
  vi.mocked(repo.findAttempt).mockResolvedValue(attempt);
});

describe("startMission", () => {
  it("starts the current mission", async () => {
    vi.mocked(repo.startMission).mockResolvedValue("attempt-1");
    await expect(service.startMission(firstMission.key)).resolves.toEqual({
      attemptId: "attempt-1",
      results: [],
    });
    expect(repo.startMission).toHaveBeenCalledWith(
      expect.anything(),
      firstMission.key,
      firstMission.version,
    );
  });

  it("refuses a locked mission and an unknown one", async () => {
    const third = content.missions[2];
    await expect(service.startMission(third?.key ?? "")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(service.startMission("no-such-mission")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(repo.startMission).not.toHaveBeenCalled();
  });

  it("is children only", async () => {
    vi.mocked(family.assertRole).mockRejectedValue(new AppError("FORBIDDEN", "You can't do that."));
    await expect(service.startMission(firstMission.key)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("recordStep", () => {
  const step = firstMission.steps.find((s) => s.type === "choice");
  if (!step || step.type !== "choice") throw new Error("mission 1 needs a choice step");
  const wrongOption = step.options.find((o) => o.id !== step.answer);
  if (!wrongOption) throw new Error("choice needs a wrong option");

  it("grades on the server, whatever the client believed", async () => {
    await expect(
      service.recordStep({
        attemptId: attempt.id,
        stepKey: step.key,
        phase: "main",
        answer: { kind: "option", optionId: wrongOption.id },
        hintsUsed: 0,
        tries: 1,
      }),
    ).resolves.toEqual({ correct: false });
    expect(repo.recordStepResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ correct: false, stepType: "choice", skillKey: step.skill }),
    );
  });

  it("grades a replay against the replay variant", async () => {
    const replay = step.replay;
    if (!replay || replay.type !== "choice") return;
    await service.recordStep({
      attemptId: attempt.id,
      stepKey: step.key,
      phase: "replay",
      answer: { kind: "option", optionId: replay.answer },
      hintsUsed: 0,
      tries: 1,
    });
    expect(repo.recordStepResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ correct: true, phase: "replay" }),
    );
  });

  it("refuses someone else's attempt and unknown steps", async () => {
    vi.mocked(repo.findAttempt).mockResolvedValueOnce({ ...attempt, childId: "child-2" });
    await expect(
      service.recordStep({
        attemptId: attempt.id,
        stepKey: step.key,
        phase: "main",
        answer: { kind: "option", optionId: step.answer },
        hintsUsed: 0,
        tries: 1,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.recordStep({
        attemptId: attempt.id,
        stepKey: "not-a-step",
        phase: "main",
        answer: { kind: "option", optionId: "x" },
        hintsUsed: 0,
        tries: 1,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repo.recordStepResult).not.toHaveBeenCalled();
  });
});

describe("completeMission", () => {
  it("refuses while steps are unanswered", async () => {
    await expect(service.completeMission(attempt.id)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(repo.completeMission).not.toHaveBeenCalled();
  });

  it("finishes when every step is right first time", async () => {
    const results = firstMission.steps
      .filter((s) => s.type !== "info")
      .map((s) => ({
        stepKey: s.key,
        phase: "main" as const,
        correct: true,
        hintsUsed: 0,
        tries: 1,
      }));
    vi.mocked(repo.listStepResults).mockResolvedValue(new Map([[attempt.id, results]]));
    vi.mocked(repo.completeMission).mockResolvedValue(true);
    await expect(service.completeMission(attempt.id)).resolves.toEqual({
      answerable: results.length,
      firstTry: results.length,
      hints: 0,
    });
  });
});

describe("recordPractice", () => {
  it("refuses an unknown item", async () => {
    await expect(
      service.recordPractice({
        itemKey: "not-an-item",
        answer: { kind: "option", optionId: "a" },
        hintsUsed: 0,
        tries: 1,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("completeCheckIn", () => {
  it("needs all five answers and counts the right ones on the server", async () => {
    await expect(service.completeCheckIn([])).rejects.toMatchObject({ code: "VALIDATION" });
    const answers = content.checkIn.questions.map((q) => ({
      stepKey: q.key,
      answer:
        q.type === "amount"
          ? { kind: "number" as const, value: q.answer }
          : q.type === "choice" || q.type === "predict" || q.type === "reason"
            ? { kind: "option" as const, optionId: q.answer }
            : { kind: "option" as const, optionId: "x" },
    }));
    vi.mocked(repo.completeCheckIn).mockResolvedValue(true);
    const result = await service.completeCheckIn(answers);
    expect(result.correctCount).toBeGreaterThanOrEqual(1);
    expect(repo.completeCheckIn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        version: content.checkIn.version,
        correctCount: result.correctCount,
      }),
    );
  });
});

describe("getLearningOverview", () => {
  it("asks for the check-in first, then mission 1", async () => {
    const overview = await service.getLearningOverview(child.id);
    expect(overview.nextStep).toEqual({ kind: "check-in" });
    expect(overview.journey[0]?.status).toBe("current");
    expect(family.assertSelfOrParentOf).toHaveBeenCalledWith(child.id);
  });
});
