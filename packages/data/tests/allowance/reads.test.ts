import { getLastSplitWith, getParentSchedule, listGiftsFor } from "@jarso/data/allowance";
import { describe, expect, it } from "vitest";
import { fakeClient, ok } from "../fake-client";

const scheduleRow = (status: string) =>
  ok({
    id: "s-1",
    amount_minor: 500,
    frequency: "weekly",
    status,
    anchor_on: "2026-11-01",
    paused_through: null,
    pause_message: null,
  });
const autoCharge = ok({
  auto_charge: true,
  auto_charge_provider: "stripe",
  auto_charge_by: "parent-1",
});

describe("getParentSchedule", () => {
  it("stopped schedule has null nextDueOn", async () => {
    const { db, rpc } = fakeClient(
      { allowance_schedules: scheduleRow("stopped") },
      { allowance_schedule_auto_charge: autoCharge, allowance_next_due_on: ok("2026-11-08") },
    );
    await expect(getParentSchedule(db, "c1", "parent-1")).resolves.toMatchObject({
      status: "stopped",
      nextDueOn: null,
    });
    expect(rpc).not.toHaveBeenCalledWith("allowance_next_due_on", expect.anything());
  });

  it("autoChargeMine true only for the viewer", async () => {
    const { db } = fakeClient(
      { allowance_schedules: scheduleRow("active") },
      { allowance_schedule_auto_charge: autoCharge, allowance_next_due_on: ok("2026-11-08") },
    );
    const mine = await getParentSchedule(db, "c1", "parent-1");
    expect(mine).toEqual({
      id: "s-1",
      amountMinor: 500,
      frequency: "weekly",
      status: "active",
      anchorOn: "2026-11-01",
      pausedThrough: null,
      pauseMessage: null,
      nextDueOn: "2026-11-08",
      autoCharge: true,
      autoChargeProvider: "stripe",
      autoChargeMine: true,
    });
    await expect(getParentSchedule(db, "c1", "parent-2")).resolves.toMatchObject({
      autoChargeProvider: "stripe",
      autoChargeMine: false,
    });
  });

  it("is null without a schedule", async () => {
    await expect(getParentSchedule(fakeClient().db, "c1", "parent-1")).resolves.toBeNull();
  });
});

describe("listGiftsFor", () => {
  it("says which provider pays a gift and whether the viewer set it", async () => {
    const row = {
      id: "gift-1",
      amount_minor: 1000,
      give_on: "2026-10-20",
      note: null,
      status: "pending",
      auto_charge: true,
      auto_charge_provider: "fake",
    };
    const { db } = fakeClient({
      parent_gifts: ok([
        { ...row, auto_charge_by: "parent-1" },
        { ...row, id: "gift-2", auto_charge_by: "x" },
      ]),
    });
    const gifts = await listGiftsFor(db, "c1", "parent-1");
    expect(gifts.map((g) => [g.id, g.autoChargeProvider, g.autoChargeMine])).toEqual([
      ["gift-1", "fake", true],
      ["gift-2", "fake", false],
    ]);
    expect(gifts[0]).not.toHaveProperty("autoChargeBy");
  });
});

describe("getLastSplitWith", () => {
  it("uses the most recent of allowance and gift handovers", async () => {
    const { db } = fakeClient({
      allowance_occurrences: ok({
        cash_minor: 300,
        saved_minor: 200,
        confirmed_at: "2026-10-20T10:00:00Z",
      }),
      parent_gifts: ok({ cash_minor: 0, saved_minor: 1000, given_at: "2026-10-25T10:00:00Z" }),
    });
    await expect(getLastSplitWith(db, "c1")).resolves.toEqual({ cash: 0, saved: 1000 });
  });

  it("is null before the first handover", async () => {
    await expect(getLastSplitWith(fakeClient().db, "c1")).resolves.toBeNull();
  });
});
