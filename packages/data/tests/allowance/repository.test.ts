import {
  closeOccurrence,
  findGift,
  findLatestSchedule,
  findScheduleRow,
  listDueForParent,
  pauseSchedule,
} from "@jarso/data/allowance";
import { describe, expect, it } from "vitest";
import { fakeClient, ok } from "../fake-client";

describe("findLatestSchedule", () => {
  it("reads only the amount, frequency and status of the newest schedule", async () => {
    const { db, queries } = fakeClient({
      allowance_schedules: ok({ amount_minor: 500, frequency: "monthly", status: "paused" }),
    });
    await expect(findLatestSchedule(db, "c1")).resolves.toEqual({
      amountMinor: 500,
      frequency: "monthly",
      status: "paused",
    });
    expect(queries[0]?.calls).toContainEqual(["select", "amount_minor, frequency, status"]);
    expect(queries[0]?.calls).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("is null without a schedule", async () => {
    await expect(findLatestSchedule(fakeClient().db, "c1")).resolves.toBeNull();
  });
});

describe("findScheduleRow", () => {
  it("maps the newest schedule, whatever its status", async () => {
    const { db, queries } = fakeClient({
      allowance_schedules: ok({
        id: "s-1",
        amount_minor: "500",
        frequency: "monthly",
        status: "stopped",
        anchor_on: "2026-11-01",
        paused_through: null,
        pause_message: null,
      }),
    });
    await expect(findScheduleRow(db, "c1")).resolves.toEqual({
      id: "s-1",
      amountMinor: 500,
      frequency: "monthly",
      status: "stopped",
      anchorOn: "2026-11-01",
      pausedThrough: null,
      pauseMessage: null,
    });
    expect(queries[0]?.calls).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("refuses an unknown frequency", async () => {
    const { db } = fakeClient({
      allowance_schedules: ok({
        id: "s-1",
        amount_minor: 500,
        frequency: "daily",
        status: "active",
        anchor_on: "2026-11-01",
        paused_through: null,
        pause_message: null,
      }),
    });
    await expect(findScheduleRow(db, "c1")).rejects.toMatchObject({ code: "INTERNAL" });
  });
});

describe("findGift", () => {
  const row = {
    id: "gift-1",
    child_id: "c1",
    amount_minor: 1000,
    give_on: "2026-10-20",
    note: null,
    status: "pending",
    auto_charge: false,
    auto_charge_provider: null,
    auto_charge_by: null,
  };

  it("maps the gift with its child and auto charge", async () => {
    const { db } = fakeClient({ parent_gifts: ok(row) });
    await expect(findGift(db, "gift-1")).resolves.toEqual({
      id: "gift-1",
      childId: "c1",
      amountMinor: 1000,
      giveOn: "2026-10-20",
      note: null,
      status: "pending",
      autoCharge: false,
      autoChargeProvider: null,
      autoChargeBy: null,
    });
  });

  it("refuses an unknown payment provider", async () => {
    const { db } = fakeClient({ parent_gifts: ok({ ...row, auto_charge_provider: "bank" }) });
    await expect(findGift(db, "gift-1")).rejects.toMatchObject({ code: "INTERNAL" });
  });
});

describe("listDueForParent", () => {
  it("maps due allowances and gifts", async () => {
    const { db } = fakeClient(
      {},
      {
        list_due_for_parent: ok([
          { kind: "gift", id: "g", due_on: "2026-10-01", amount_minor: "700", note: "Hi" },
          { kind: "allowance", id: "o", due_on: "2026-10-02", amount_minor: 500, note: null },
        ]),
      },
    );
    await expect(listDueForParent(db, "c1")).resolves.toEqual([
      { kind: "gift", id: "g", dueOn: "2026-10-01", amountMinor: 700, note: "Hi" },
      { kind: "allowance", id: "o", dueOn: "2026-10-02", amountMinor: 500, note: null },
    ]);
  });
});

describe("pauseSchedule", () => {
  it("sends a null pause end and a blank message", async () => {
    const { db, rpc } = fakeClient();
    await pauseSchedule(db, { scheduleId: "s-1", through: null, message: null });
    expect(rpc).toHaveBeenCalledWith("pause_allowance", {
      p_schedule_id: "s-1",
      p_through: null,
      p_message: "",
    });
  });
});

describe("closeOccurrence", () => {
  it("refuses a result it doesn't know", async () => {
    const { db } = fakeClient({}, { mark_not_given: ok("maybe") });
    await expect(closeOccurrence(db, "occ-1")).rejects.toMatchObject({ code: "INTERNAL" });
  });
});
