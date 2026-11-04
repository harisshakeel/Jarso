import { saveAllowNegativeSpend, saveJarMovesApproval, saveMoneyRule } from "@jarso/data/rules";
import { describe, expect, it } from "vitest";
import { fakeClient } from "../fake-client";

describe("rule writes", () => {
  it("passes null through to clear a money rule", async () => {
    const { db, rpc } = fakeClient();
    await saveMoneyRule(db, {
      childId: "c1",
      kind: "spend_limit",
      period: "week",
      amountMinor: null,
    });
    expect(rpc).toHaveBeenCalledWith("set_money_rule", {
      p_child_id: "c1",
      p_kind: "spend_limit",
      p_period: "week",
      p_amount_minor: null,
    });
  });

  it("saves the jar moves mode and the overspend switch", async () => {
    const { db, rpc } = fakeClient();
    await saveJarMovesApproval(db, "c1", "notify");
    await saveAllowNegativeSpend(db, "c1", true);
    expect(rpc).toHaveBeenNthCalledWith(1, "set_jar_moves_approval", {
      p_child_id: "c1",
      p_mode: "notify",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "set_allow_negative_spend", {
      p_child_id: "c1",
      p_allowed: true,
    });
  });

  it("turns a refused write into a safe error", async () => {
    const { db } = fakeClient(
      {},
      { set_money_rule: { data: null, error: { code: "JA403", message: "denied" } } },
    );
    await expect(
      saveMoneyRule(db, { childId: "c1", kind: "spend_limit", period: "week", amountMinor: 100 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
