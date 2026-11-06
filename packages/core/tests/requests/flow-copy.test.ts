import { wordCount } from "@jarso/core/home";
import { describe, expect, it } from "vitest";
import {
  type AskKind,
  askCelebration,
  askFlowCopy,
  askReasons,
  emergencySchema,
  heldLine,
  type RequestKind,
  type RequestStatus,
  reasonText,
  type SavingsRequest,
  trackerSteps,
  withdrawalSchema,
} from "../../src/requests";

const goal = { emoji: "⚽", name: "Boots" };
const KEY = "00000000-0000-4000-8000-000000000000";
const req = (kind: RequestKind, status: RequestStatus): SavingsRequest => ({
  id: "x",
  kind,
  status,
  amountMinor: 6000,
  reason: null,
  auto: false,
  occurredAt: "2026-11-06T10:00:00Z",
});

describe("ask flow copy", () => {
  it("deposit button says the real action", () =>
    expect(askFlowCopy("Mum").deposit.button("₹50")).toBe("I'll give ₹50 to Mum"));
  it("only sentence starts capitalise", () => {
    expect(askFlowCopy("your parent").withdrawal.button).toBe("Ask your parent");
    expect(askCelebration("withdrawal", "approved", "₹60", "your parent").title).toBe(
      "Your parent said yes!",
    );
  });
  it("reasons put the goal first for withdrawals only", () => {
    expect(askReasons("withdrawal", goal)[0]).toMatchObject({
      key: "goal",
      label: "My goal",
      emoji: "⚽",
    });
    expect(askReasons("emergency", goal).map((r) => r.key)).not.toContain("goal");
    expect(askReasons("withdrawal", null).map((r) => r.label)).toEqual([
      "Games",
      "A gift",
      "Clothes",
      "Going out",
      "School",
      "Other",
    ]);
  });
  it("reasonText for the goal and for Other", () => {
    const options = askReasons("withdrawal", goal);
    expect(reasonText("goal", options, "", goal)).toBe("My goal: Boots");
    expect(reasonText("goal", options, "", { emoji: "x", name: "a".repeat(200) })).toHaveLength(
      140,
    );
    expect(reasonText("other", options, "  a kite ", goal)).toBe("a kite");
    expect(reasonText("games", options, "", goal)).toBe("Games");
  });
  it('emergency Other with no text gives "" so the schema refuses it', () => {
    const reason = reasonText("other", askReasons("emergency", null), "  ", null);
    expect(reason).toBe("");
    expect(
      emergencySchema("INR").safeParse({ amount: "50", reason, idempotencyKey: KEY }).success,
    ).toBe(false);
    expect(
      withdrawalSchema("INR").safeParse({ amount: "50", reason: "Games", idempotencyKey: KEY })
        .success,
    ).toBe(true);
  });
  it("askCelebration maps every status", () => {
    const cases: [AskKind, string, string, string | undefined, boolean][] = [
      ["deposit", "pending", "Now give Mum ₹60", "Then it's in Save", true],
      ["deposit", "confirmed", "₹60 in Save!", undefined, false],
      ["deposit", "done", "₹60 in Save!", undefined, false],
      ["withdrawal", "pending", "Asked Mum!", "₹60 from savings", true],
      ["withdrawal", "approved", "Mum said yes!", "Mum will hand you ₹60", true],
      ["withdrawal", "done", "₹60 is yours", "Mum knows", false],
      ["emergency", "pending", "Asked Mum!", "₹60 extra", true],
      ["deposit", "already_sent", "Already sent to Mum", undefined, false],
      ["withdrawal", "already_sent", "Already sent to Mum", undefined, false],
      ["emergency", "already_sent", "Already sent to Mum", undefined, false],
    ];
    for (const [kind, status, title, subtitle, tracked] of cases) {
      expect(askCelebration(kind, status, "₹60", "Mum")).toEqual({ title, subtitle, tracked });
    }
  });
});

describe("trackerSteps", () => {
  const when = "Today, 4:10 pm";
  it("tracker pending deposit", () =>
    expect(trackerSteps(req("deposit", "pending"), "₹60", "Mum", when)).toEqual([
      { state: "done", title: "You asked", sub: when },
      { state: "now", title: "Give Mum the ₹60", sub: "Hand over the cash" },
      { state: "next", title: "In your Save jar" },
    ]));
  it("tracker approved withdrawal", () =>
    expect(trackerSteps(req("withdrawal", "approved"), "₹60", "your parent", when)).toEqual([
      { state: "done", title: "You asked", sub: when },
      { state: "done", title: "Your parent says yes" },
      { state: "now", title: "Cash in your hand" },
    ]));
  it("tracker done", () => {
    for (const [kind, status] of [
      ["deposit", "confirmed"],
      ["withdrawal", "handed_over"],
    ] as const) {
      const steps = trackerSteps(req(kind, status), "₹60", "Mum", when);
      expect(steps?.every((s) => s.state === "done")).toBe(true);
    }
  });
  it("tracker rejected is null", () => {
    expect(trackerSteps(req("emergency", "rejected"), "₹60", "Mum", when)).toBeNull();
    expect(trackerSteps(req("emergency", "cancelled"), "₹60", "Mum", when)).toBeNull();
  });
  it("every tracker title fits 6 words", () => {
    for (const kind of ["deposit", "withdrawal", "emergency"] as const) {
      for (const s of trackerSteps(req(kind, "pending"), "₹60", "your parent", when) ?? []) {
        expect(wordCount(s.title)).toBeLessThanOrEqual(6);
      }
    }
  });
  it("heldLine", () => expect(heldLine("₹60")).toBe("₹60 held in Spend till then"));
});
