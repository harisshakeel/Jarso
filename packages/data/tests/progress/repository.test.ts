import { isAppError } from "@jarso/core/lib";
import { findParentLabels } from "@jarso/data/family";
import { dailyCheckin, getProgress, setJarsoLook } from "@jarso/data/progress";
import { describe, expect, it } from "vitest";
import { fakeClient, ok } from "../fake-client";

const progress = {
  sparks: 120,
  level: 2,
  nextLevelAt: 250,
  streak: 3,
  bestStreak: 5,
  restUsedThisWeek: false,
  checkedInToday: true,
  look: { lid: "cyan", wear: "none" },
  badges: [
    { key: "first_log", earnedAt: "2026-11-01T10:00:00Z" },
    { key: "not_a_badge", earnedAt: "2026-11-01T10:00:00Z" },
  ],
  recent: [{ kind: "log", amount: 10, createdAt: "2026-11-01T10:00:00Z" }],
};

describe("getProgress", () => {
  it("calls get_progress and parses the result", async () => {
    const { db, rpc } = fakeClient({}, { get_progress: ok(progress) });
    const result = await getProgress(db, "c1");
    expect(rpc).toHaveBeenCalledWith("get_progress", { p_child_id: "c1" });
    expect(result.sparks).toBe(120);
    expect(result.badges.map((b) => b.key)).not.toContain("not_a_badge");
  });

  it("throws an AppError on a database error", async () => {
    const { db } = fakeClient({}, { get_progress: { data: null, error: { code: "JA403" } } });
    const error = await getProgress(db, "c1").catch((e: unknown) => e);
    expect(isAppError(error) && error.code).toBe("FORBIDDEN");
  });

  it("throws an AppError on a malformed result", async () => {
    const { db } = fakeClient({}, { get_progress: ok({ nope: true }) });
    const error = await getProgress(db, "c1").catch((e: unknown) => e);
    expect(isAppError(error) && error.code).toBe("INTERNAL");
  });
});

describe("dailyCheckin", () => {
  it("sends the answer and returns the status", async () => {
    const { db, rpc } = fakeClient({}, { daily_checkin: ok({ status: "recorded", sparks: 5 }) });
    await expect(dailyCheckin(db, "nope")).resolves.toEqual({ status: "recorded", sparks: 5 });
    expect(rpc).toHaveBeenCalledWith("daily_checkin", { p_answer: "nope" });
  });

  it("throws an AppError on a database error", async () => {
    const { db } = fakeClient({}, { daily_checkin: { data: null, error: { code: "JA403" } } });
    await expect(dailyCheckin(db, "yes")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("setJarsoLook", () => {
  it("sends the look", async () => {
    const { db, rpc } = fakeClient();
    await setJarsoLook(db, { lid: "grape", wear: "cap" });
    expect(rpc).toHaveBeenCalledWith("set_jarso_look", { p_lid: "grape", p_wear: "cap" });
  });

  it("maps JA409 to a kind validation error", async () => {
    const { db } = fakeClient({}, { set_jarso_look: { data: null, error: { code: "JA409" } } });
    await expect(setJarsoLook(db, { lid: "cyan", wear: "crown" })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Not unlocked yet",
    });
  });
});

describe("findParentLabels", () => {
  const members = (parents: unknown) => (calls: [string, ...unknown[]][]) =>
    calls.some(([m, col]) => m === "eq" && col === "profile_id")
      ? ok({ family_id: "f1", role: "child" })
      : ok(parents);

  it("returns the labels in the order added and drops nulls", async () => {
    const { db, queries } = fakeClient({
      family_members: members([
        { profile: { child_facing_name: "Mum" } },
        { profile: { child_facing_name: null } },
        { profile: { child_facing_name: "Dad" } },
      ]),
    });
    await expect(findParentLabels(db, "c1")).resolves.toEqual(["Mum", "Dad"]);
    const calls = queries[1]?.calls ?? [];
    expect(calls).toContainEqual(["eq", "family_id", "f1"]);
    expect(calls).toContainEqual(["eq", "role", "parent"]);
    expect(calls).toContainEqual(["eq", "status", "approved"]);
    expect(calls).toContainEqual(["order", "created_at", { ascending: true }]);
  });

  it("is empty without a family", async () => {
    await expect(findParentLabels(fakeClient().db, "c1")).resolves.toEqual([]);
  });
});
