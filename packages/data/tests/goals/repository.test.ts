import { callGoalProgress, callSaveGoal, findActiveGoal } from "@jarso/data/goals";
import { describe, expect, it } from "vitest";
import { fakeClient, ok } from "../fake-client";

const row = {
  id: "g1",
  name: "Football boots",
  emoji: "⚽",
  target_minor: 4500,
  plan_minor: null,
  reached_at: null,
  celebrated_at: null,
};

describe("findActiveGoal", () => {
  it("reads the child's active goal in camelCase", async () => {
    const { db, queries } = fakeClient({ goals: ok(row) });
    await expect(findActiveGoal(db, "c1")).resolves.toEqual({
      id: "g1",
      name: "Football boots",
      emoji: "⚽",
      targetMinor: 4500,
      planMinor: null,
      reachedAt: null,
      celebratedAt: null,
    });
    expect(queries[0]?.calls).toContainEqual(["eq", "child_id", "c1"]);
    expect(queries[0]?.calls).toContainEqual(["eq", "status", "active"]);
  });

  it("is null without one", async () => {
    await expect(findActiveGoal(fakeClient().db, "c1")).resolves.toBeNull();
  });
});

describe("callGoalProgress", () => {
  it("maps the first row", async () => {
    const { db, rpc } = fakeClient(
      {},
      { goal_progress: ok([{ goal_id: "g1", counted_minor: 26 }]) },
    );
    await expect(callGoalProgress(db, "c1")).resolves.toEqual({ goalId: "g1", countedMinor: 26 });
    expect(rpc).toHaveBeenCalledWith("goal_progress", { p_child_id: "c1" });
  });
});

describe("callSaveGoal", () => {
  const input = { name: "Boots", emoji: "⚽", targetMinor: 4500, planMinor: 9000 };

  it("turns a plan refusal into a field error", async () => {
    const { db } = fakeClient(
      {},
      { save_goal: { data: null, error: { code: "22023", message: "plan_over_target" } } },
    );
    await expect(callSaveGoal(db, input)).rejects.toMatchObject({
      code: "VALIDATION",
      message: "That's more than your goal costs. Try a smaller amount.",
      fieldErrors: { plan: ["That's more than your goal costs. Try a smaller amount."] },
    });
  });

  it("returns the id", async () => {
    const { db } = fakeClient({}, { save_goal: ok("g1") });
    await expect(callSaveGoal(db, input)).resolves.toBe("g1");
  });
});
