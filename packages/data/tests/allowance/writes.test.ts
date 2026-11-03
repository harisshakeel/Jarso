import { allowanceErrors } from "@jarso/core/allowance";
import {
  cancelGift,
  changeAllowance,
  confirmHandover,
  createAllowance,
  createGift,
  markNotGiven,
  pauseAllowance,
  resumeAllowance,
  stopAllowance,
  updateGift,
} from "@jarso/data/allowance";
import { describe, expect, it } from "vitest";
import { fakeClient, ok } from "../fake-client";

const conflict = { data: null, error: { code: "JA409", message: "nope" } };
const giftRow = (overrides: Record<string, unknown> = {}) =>
  ok({
    id: "gift-1",
    child_id: "c1",
    amount_minor: 1000,
    give_on: "2026-10-20",
    note: null,
    status: "pending",
    auto_charge: false,
    auto_charge_provider: null,
    auto_charge_by: null,
    ...overrides,
  });
const handover = {
  id: "occ-1",
  cashMinor: 300,
  savedMinor: 200,
  idempotencyKey: "key-1",
};

describe("schedule writes", () => {
  it("create conflict says alreadyExists", async () => {
    const { db } = fakeClient({}, { create_allowance: conflict });
    await expect(
      createAllowance(db, {
        childId: "c1",
        amountMinor: 500,
        frequency: "weekly",
        firstOn: "2026-11-01",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: allowanceErrors.alreadyExists });
  });

  const change = { scheduleId: "s-1", amountMinor: 500, frequency: "weekly", nextOn: "2026-11-01" };

  it("change 22023 puts nextOn field error", async () => {
    const { db } = fakeClient(
      {},
      { change_allowance: { data: null, error: { code: "22023", message: "after the pause" } } },
    );
    await expect(changeAllowance(db, { ...change, frequency: "weekly" })).rejects.toMatchObject({
      code: "VALIDATION",
      message: allowanceErrors.nextOn,
      fieldErrors: { nextOn: [allowanceErrors.nextOn] },
    });
  });

  it("change conflict says the allowance stopped", async () => {
    const { db } = fakeClient({}, { change_allowance: conflict });
    await expect(changeAllowance(db, { ...change, frequency: "weekly" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: allowanceErrors.stopped,
    });
  });

  it("pause conflict already paused at same date resolves", async () => {
    const { db } = fakeClient(
      { allowance_schedules: ok({ status: "paused", paused_through: "2026-11-10" }) },
      { pause_allowance: conflict },
    );
    await expect(
      pauseAllowance(db, { scheduleId: "s-1", through: "2026-11-10", message: null }),
    ).resolves.toBeUndefined();
  });

  it("pause conflict paused to another date says notRunning", async () => {
    const { db } = fakeClient(
      { allowance_schedules: ok({ status: "paused", paused_through: "2026-12-01" }) },
      { pause_allowance: conflict },
    );
    await expect(
      pauseAllowance(db, { scheduleId: "s-1", through: "2026-11-10", message: null }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: allowanceErrors.notRunning });
  });

  it("resume conflict when already active resolves, when stopped says notPaused", async () => {
    const active = fakeClient(
      { allowance_schedules: ok({ status: "active", paused_through: null }) },
      { resume_allowance: conflict },
    );
    await expect(resumeAllowance(active.db, "s-1")).resolves.toBeUndefined();
    const stopped = fakeClient(
      { allowance_schedules: ok({ status: "stopped", paused_through: null }) },
      { resume_allowance: conflict },
    );
    await expect(resumeAllowance(stopped.db, "s-1")).rejects.toMatchObject({
      code: "CONFLICT",
      message: allowanceErrors.notPaused,
    });
  });

  it("stop conflict when already stopped resolves", async () => {
    const { db } = fakeClient(
      { allowance_schedules: ok({ status: "stopped", paused_through: null }) },
      { stop_allowance: conflict },
    );
    await expect(stopAllowance(db, "s-1")).resolves.toBeUndefined();
  });

  // The plan named this "says notRunning"; the web line for stop is alreadyStopped, kept verbatim.
  it("stop conflict when not stopped keeps the stop line", async () => {
    const { db } = fakeClient(
      { allowance_schedules: ok({ status: "active", paused_through: null }) },
      { stop_allowance: conflict },
    );
    await expect(stopAllowance(db, "s-1")).rejects.toMatchObject({
      code: "CONFLICT",
      message: allowanceErrors.alreadyStopped,
    });
  });

  it("a failed re-read keeps the CONFLICT", async () => {
    const { db } = fakeClient(
      { allowance_schedules: { data: null, error: { code: "JA503", message: "slow" } } },
      { stop_allowance: conflict },
    );
    await expect(stopAllowance(db, "s-1")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("leaves other errors alone", async () => {
    const { db } = fakeClient({}, { stop_allowance: { data: null, error: { code: "XX000" } } });
    await expect(stopAllowance(db, "s-1")).rejects.toMatchObject({ code: "INTERNAL" });
  });
});

describe("gift writes", () => {
  it("createGift forwards the idempotency key and a blank note", async () => {
    const { db, rpc } = fakeClient({}, { create_gift: ok("gift-1") });
    await expect(
      createGift(db, {
        childId: "c1",
        amountMinor: 1000,
        giveOn: "2026-11-01",
        note: null,
        idempotencyKey: "gift-key-1",
      }),
    ).resolves.toBe("gift-1");
    expect(rpc).toHaveBeenCalledWith("create_gift", {
      p_child_id: "c1",
      p_amount_minor: 1000,
      p_give_on: "2026-11-01",
      p_note: "",
      p_idempotency_key: "gift-key-1",
    });
  });

  const edit = { giftId: "gift-1", amountMinor: 900, note: null };

  it("updateGift past changed date → VALIDATION giveOn", async () => {
    const { db, rpc } = fakeClient({ parent_gifts: giftRow() });
    await expect(
      updateGift(db, { ...edit, giveOn: "2026-10-21" }, "2026-10-29"),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { giveOn: [allowanceErrors.giftDatePast] },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("updateGift same past date passes", async () => {
    const { db, rpc } = fakeClient({ parent_gifts: giftRow() });
    await expect(
      updateGift(db, { ...edit, giveOn: "2026-10-20" }, "2026-10-29"),
    ).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith(
      "update_gift",
      expect.objectContaining({ p_amount_minor: 900 }),
    );
  });

  it("updateGift conflict says giftDone", async () => {
    const { db } = fakeClient({ parent_gifts: giftRow() }, { update_gift: conflict });
    await expect(
      updateGift(db, { ...edit, giveOn: "2026-11-02" }, "2026-10-29"),
    ).rejects.toMatchObject({ code: "CONFLICT", message: allowanceErrors.giftDone });
  });

  it("cancel conflict when already cancelled resolves, when given says giftDone", async () => {
    const cancelled = fakeClient(
      { parent_gifts: giftRow({ status: "cancelled" }) },
      { cancel_gift: conflict },
    );
    await expect(cancelGift(cancelled.db, "gift-1")).resolves.toBeUndefined();
    const given = fakeClient(
      { parent_gifts: giftRow({ status: "given" }) },
      { cancel_gift: conflict },
    );
    await expect(cancelGift(given.db, "gift-1")).rejects.toMatchObject({
      code: "CONFLICT",
      message: allowanceErrors.giftDone,
    });
  });
});

describe("handover", () => {
  it("passes already_confirmed through with the args", async () => {
    const { db, rpc } = fakeClient({}, { confirm_handover: ok("already_confirmed") });
    await expect(confirmHandover(db, { kind: "allowance", ...handover })).resolves.toBe(
      "already_confirmed",
    );
    expect(rpc).toHaveBeenCalledWith("confirm_handover", {
      p_occurrence_id: "occ-1",
      p_cash_minor: 300,
      p_saved_minor: 200,
      p_idempotency_key: "key-1",
    });
  });

  it("handover not_given throws CONFLICT notGiven", async () => {
    const { db } = fakeClient({}, { confirm_handover: ok("not_given") });
    await expect(confirmHandover(db, { kind: "allowance", ...handover })).rejects.toMatchObject({
      code: "CONFLICT",
      message: allowanceErrors.notGiven,
    });
  });

  it("gift handover goes to the gift function", async () => {
    const { db, rpc } = fakeClient({}, { confirm_gift_handover: ok("confirmed") });
    await expect(confirmHandover(db, { kind: "gift", ...handover, id: "gift-1" })).resolves.toBe(
      "confirmed",
    );
    expect(rpc).not.toHaveBeenCalledWith("confirm_handover", expect.anything());
  });

  it("gift handover cancelled throws CONFLICT giftCancelled", async () => {
    const { db } = fakeClient({}, { confirm_gift_handover: ok("cancelled") });
    await expect(
      confirmHandover(db, { kind: "gift", ...handover, id: "gift-1" }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: allowanceErrors.giftCancelled });
  });

  it("gift handover conflict says giftNotDue", async () => {
    const { db } = fakeClient({}, { confirm_gift_handover: conflict });
    await expect(
      confirmHandover(db, { kind: "gift", ...handover, id: "gift-1" }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: allowanceErrors.giftNotDue });
  });

  it("markNotGiven passes already_handled through", async () => {
    const { db } = fakeClient({}, { mark_not_given: ok("already_handled") });
    await expect(markNotGiven(db, "occ-1")).resolves.toBe("already_handled");
  });
});
