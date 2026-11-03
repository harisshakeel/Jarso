import { getGoalView } from "@jarso/data/goals";
import { describe, expect, it } from "vitest";
import { fakeClient, ok } from "../fake-client";

const goalRow = {
  id: "g1",
  name: "Football boots",
  emoji: "⚽",
  target_minor: 4500,
  plan_minor: 400,
  reached_at: null,
  celebrated_at: null,
};

describe("getGoalView", () => {
  it("is null when the child has no active goal", async () => {
    const { db } = fakeClient({}, { goal_progress: ok([]) });
    await expect(getGoalView(db, "c1")).resolves.toBeNull();
  });

  it("calls goal_progress before reading the goal", async () => {
    const { db, rpc, from } = fakeClient(
      { goals: ok(goalRow) },
      { goal_progress: ok([{ goal_id: "g1", counted_minor: 2600 }]) },
    );
    const view = await getGoalView(db, "c1");
    // Progress first: it records reached_at, which the goal row then carries.
    expect(from.mock.invocationCallOrder[0]).toBeGreaterThan(rpc.mock.invocationCallOrder[0] ?? 0);
    expect(view?.goal.targetMinor).toBe(4500);
    expect(view?.progress).toMatchObject({
      countedMinor: 2600,
      remainingMinor: 1900,
      paymentsLeft: 5,
      reached: false,
    });
  });
});
