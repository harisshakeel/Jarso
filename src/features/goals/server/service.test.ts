import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/features/family/server", () => ({
  assertRole: vi.fn(),
  assertSelfOrParentOf: vi.fn(),
}));
vi.mock("./repository", () => ({
  callArchiveGoal: vi.fn(),
  callGoalProgress: vi.fn(),
  callMarkCelebrated: vi.fn(),
  callSaveGoal: vi.fn(),
  findActiveGoal: vi.fn(),
}));

const family = await import("@/features/family/server");
const repo = await import("./repository");
const service = await import("./service");

const goal = {
  id: "g1",
  name: "Football boots",
  emoji: "⚽",
  targetMinor: 4500,
  planMinor: 400,
  reachedAt: null,
  celebratedAt: null,
};

beforeEach(() => vi.resetAllMocks());

describe("getGoalView", () => {
  it("is null when the child has no active goal", async () => {
    vi.mocked(repo.callGoalProgress).mockResolvedValue(null);
    vi.mocked(repo.findActiveGoal).mockResolvedValue(null);
    await expect(service.getGoalView("child-1")).resolves.toBeNull();
    expect(family.assertSelfOrParentOf).toHaveBeenCalledWith("child-1");
  });

  it("combines the goal with progress from counted Save", async () => {
    vi.mocked(repo.callGoalProgress).mockResolvedValue({ goalId: "g1", countedMinor: 2600 });
    vi.mocked(repo.findActiveGoal).mockResolvedValue(goal);
    const view = await service.getGoalView("child-1");
    expect(view?.goal).toEqual(goal);
    expect(view?.progress).toMatchObject({
      countedMinor: 2600,
      remainingMinor: 1900,
      paymentsLeft: 5,
      reached: false,
    });
  });
});

describe("goal writes", () => {
  it("only a child saves a goal", async () => {
    vi.mocked(family.assertRole).mockRejectedValue(new Error("not a child"));
    await expect(
      service.saveGoal({ name: "Boots", emoji: "⚽", targetMinor: 4500, planMinor: null }),
    ).rejects.toThrow("not a child");
    expect(repo.callSaveGoal).not.toHaveBeenCalled();
  });

  it("saves through the repository and returns the id", async () => {
    vi.mocked(repo.callSaveGoal).mockResolvedValue("g1");
    const input = { name: "Boots", emoji: "⚽", targetMinor: 4500, planMinor: 400 };
    await expect(service.saveGoal(input)).resolves.toBe("g1");
    expect(repo.callSaveGoal).toHaveBeenCalledWith({ kind: "user" }, input);
  });
});
