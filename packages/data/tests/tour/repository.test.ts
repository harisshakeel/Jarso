import { isAppError } from "@jarso/core/lib";
import { completeOnboarding, findTour, saveTour } from "@jarso/data/tour";
import { describe, expect, it } from "vitest";
import { fakeClient, ok } from "../fake-client";

describe("completeOnboarding", () => {
  it("calls the function and returns what it paid", async () => {
    const { db, rpc } = fakeClient(
      {},
      { complete_child_onboarding: ok({ sparks: 50, badge: "jar_starter" }) },
    );
    await expect(completeOnboarding(db)).resolves.toEqual({ sparks: 50, badge: "jar_starter" });
    expect(rpc).toHaveBeenCalledWith("complete_child_onboarding");
  });

  it("a replay returns no sparks and no badge", async () => {
    const { db } = fakeClient({}, { complete_child_onboarding: ok({ sparks: 0, badge: null }) });
    await expect(completeOnboarding(db)).resolves.toEqual({ sparks: 0, badge: null });
  });

  it("a database error becomes an AppError", async () => {
    const { db } = fakeClient(
      {},
      {
        complete_child_onboarding: { data: null, error: { code: "JA403", message: "Not allowed" } },
      },
    );
    const error = await completeOnboarding(db).catch((e: unknown) => e);
    expect(isAppError(error) && error.code).toBe("FORBIDDEN");
  });

  it("a malformed result is INTERNAL", async () => {
    const { db } = fakeClient({}, { complete_child_onboarding: ok({ nope: true }) });
    const error = await completeOnboarding(db).catch((e: unknown) => e);
    expect(isAppError(error) && error.code).toBe("INTERNAL");
  });
});

describe("findTour", () => {
  it("reads the row", async () => {
    const { db, queries } = fakeClient({
      child_tours: ok({ buddy: "bo", finished_at: "2026-11-06T10:00:00Z" }),
    });
    await expect(findTour(db, "c1")).resolves.toEqual({
      buddy: "bo",
      finishedAt: "2026-11-06T10:00:00Z",
    });
    expect(queries[0]?.calls).toContainEqual(["eq", "child_id", "c1"]);
  });

  it("a missing row is not started", async () => {
    const { db } = fakeClient({ child_tours: ok(null) });
    await expect(findTour(db, "c1")).resolves.toEqual({ buddy: null, finishedAt: null });
  });
});

describe("saveTour", () => {
  it("sends null for a missing buddy", async () => {
    const { db, rpc } = fakeClient({}, { save_welcome_tour: ok(null) });
    await saveTour(db, { finished: true });
    expect(rpc).toHaveBeenCalledWith("save_welcome_tour", { p_buddy: null, p_finished: true });
  });
});
