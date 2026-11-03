import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/features/family/server", () => ({
  assertRole: vi.fn(),
  assertSelfOrParentOf: vi.fn(),
}));
vi.mock("@/features/goals/server/repository", () => ({
  callArchiveGoal: vi.fn(),
  callMarkCelebrated: vi.fn(),
  callSaveGoal: vi.fn(),
}));
vi.mock("@jarso/data/goals", () => ({ getGoalView: vi.fn() }));

const family = await import("@/features/family/server");
const repo = await import("@/features/goals/server/repository");
const data = await import("@jarso/data/goals");
const service = await import("@/features/goals/server/service");

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
  it("checks the caller, then delegates to the shared read", async () => {
    const view = { goal, progress: { countedMinor: 0 } } as never;
    vi.mocked(data.getGoalView).mockResolvedValue(view);
    await expect(service.getGoalView("child-1")).resolves.toBe(view);
    expect(family.assertSelfOrParentOf).toHaveBeenCalledWith("child-1");
    expect(data.getGoalView).toHaveBeenCalledWith({ kind: "user" }, "child-1");
  });

  it("does not read when the caller may not see the child", async () => {
    vi.mocked(family.assertSelfOrParentOf).mockRejectedValue(new Error("forbidden"));
    await expect(service.getGoalView("child-1")).rejects.toThrow("forbidden");
    expect(data.getGoalView).not.toHaveBeenCalled();
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
