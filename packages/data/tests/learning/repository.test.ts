import {
  listAttempts,
  listRecentPracticeKeys,
  listReviewItems,
  listStepResults,
} from "@jarso/data/learning";
import { describe, expect, it } from "vitest";
import { fakeClient, ok } from "../fake-client";

const attempt = (id: string, status: string) => ({
  id,
  child_id: "c1",
  mission_key: "m",
  content_version: 1,
  status,
  started_at: "t",
  completed_at: null,
});

describe("listAttempts", () => {
  it("skips abandoned attempts and returns oldest first", async () => {
    const { db, queries } = fakeClient({
      mission_attempts: ok([attempt("new", "started"), attempt("old", "completed")]),
    });
    const rows = await listAttempts(db, "c1");
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ["old", "completed"],
      ["new", "started"],
    ]);
    expect(queries[0]?.calls).toContainEqual(["neq", "status", "abandoned"]);
  });
});

describe("listStepResults", () => {
  it("reads nothing without attempts", async () => {
    const { db, from } = fakeClient();
    await expect(listStepResults(db, [])).resolves.toEqual(new Map());
    expect(from).not.toHaveBeenCalled();
  });

  it("groups results by attempt", async () => {
    const row = (attempt_id: string, step_key: string) => ({
      attempt_id,
      step_key,
      phase: "main",
      correct: true,
      hints_used: 0,
      tries: 1,
    });
    const { db } = fakeClient({
      step_results: ok([row("a", "s1"), row("b", "s1"), row("a", "s2")]),
    });
    const grouped = await listStepResults(db, ["a", "b"]);
    expect(grouped.get("a")?.map((r) => r.stepKey)).toEqual(["s1", "s2"]);
    expect(grouped.get("b")).toHaveLength(1);
  });
});

describe("listReviewItems", () => {
  it("drops unknown skills", async () => {
    const { db } = fakeClient({
      review_items: ok([
        { skill_key: "balance.afford", box: 1, due_on: "2026-11-02" },
        { skill_key: "not_a_skill", box: 1, due_on: "2026-11-02" },
      ]),
    });
    await expect(listReviewItems(db, "c1")).resolves.toEqual([
      { skillKey: "balance.afford", box: 1, dueOn: "2026-11-02" },
    ]);
  });
});

describe("listRecentPracticeKeys", () => {
  it("reads item keys answered since a date", async () => {
    const { db, queries } = fakeClient({ practice_results: ok([{ item_key: "r1" }]) });
    await expect(listRecentPracticeKeys(db, "c1", "2026-10-20")).resolves.toEqual(["r1"]);
    expect(queries[0]?.calls).toContainEqual(["gte", "answered_on", "2026-10-20"]);
  });
});
