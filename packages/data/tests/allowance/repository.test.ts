import { findLatestSchedule } from "@jarso/data/allowance";
import { describe, expect, it } from "vitest";
import { fakeClient, ok } from "../fake-client";

describe("findLatestSchedule", () => {
  it("reads only the amount and status of the newest schedule", async () => {
    const { db, queries } = fakeClient({
      allowance_schedules: ok({ amount_minor: 500, status: "paused" }),
    });
    await expect(findLatestSchedule(db, "c1")).resolves.toEqual({
      amountMinor: 500,
      status: "paused",
    });
    expect(queries[0]?.calls).toContainEqual(["select", "amount_minor, status"]);
    expect(queries[0]?.calls).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("is null without a schedule", async () => {
    await expect(findLatestSchedule(fakeClient().db, "c1")).resolves.toBeNull();
  });
});
