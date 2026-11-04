import { fetchAutoChargeState } from "@jarso/data/payments";
import { describe, expect, it } from "vitest";
import { fakeClient, ok } from "../fake-client";

const gift = (giveOn: string, on: boolean) =>
  ok({
    id: "g1",
    child_id: "c1",
    amount_minor: 500,
    give_on: giveOn,
    note: null,
    status: "pending",
    auto_charge: on,
    auto_charge_provider: on ? "razorpay" : null,
    auto_charge_by: on ? "p1" : null,
  });

describe("fetchAutoChargeState", () => {
  it("reads a schedule's auto charge through the rpc", async () => {
    const { db, rpc } = fakeClient(
      {},
      {
        allowance_schedule_auto_charge: ok({
          auto_charge: true,
          auto_charge_provider: "stripe",
          auto_charge_by: "p1",
        }),
      },
    );
    await expect(
      fetchAutoChargeState(db, { type: "allowance_schedule", id: "s1" }, "2026-11-03"),
    ).resolves.toEqual({ on: true, provider: "stripe", by: "p1", overdue: false });
    expect(rpc).toHaveBeenCalledWith("allowance_schedule_auto_charge", { p_schedule_id: "s1" });
  });

  it("marks an off gift past its day as overdue", async () => {
    const { db } = fakeClient({ parent_gifts: gift("2026-11-02", false) });
    await expect(
      fetchAutoChargeState(db, { type: "parent_gift", id: "g1" }, "2026-11-03"),
    ).resolves.toEqual({ on: false, provider: null, by: null, overdue: true });
  });

  it("an on gift past its day is not overdue", async () => {
    const { db } = fakeClient({ parent_gifts: gift("2026-11-02", true) });
    await expect(
      fetchAutoChargeState(db, { type: "parent_gift", id: "g1" }, "2026-11-03"),
    ).resolves.toEqual({ on: true, provider: "razorpay", by: "p1", overdue: false });
  });

  it("an off gift due today is not overdue", async () => {
    const { db } = fakeClient({ parent_gifts: gift("2026-11-03", false) });
    await expect(
      fetchAutoChargeState(db, { type: "parent_gift", id: "g1" }, "2026-11-03"),
    ).resolves.toMatchObject({ overdue: false });
  });

  it("answers NOT_FOUND for a gift the caller cannot read", async () => {
    const { db } = fakeClient({ parent_gifts: ok(null) });
    await expect(
      fetchAutoChargeState(db, { type: "parent_gift", id: "g1" }, "2026-11-03"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses an unknown provider", async () => {
    const { db } = fakeClient(
      {},
      {
        allowance_schedule_auto_charge: ok({
          auto_charge: true,
          auto_charge_provider: "paypal",
          auto_charge_by: "p1",
        }),
      },
    );
    await expect(
      fetchAutoChargeState(db, { type: "allowance_schedule", id: "s1" }, "2026-11-03"),
    ).rejects.toMatchObject({ code: "INTERNAL" });
  });
});
