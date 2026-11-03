import {
  type ActionDraft,
  type ActionFields,
  actionDraftSchema,
  describeDraft,
  draftFromFields,
  formProblem,
  isActionKindFor,
  missingActionFields,
  proposalFromStored,
} from "@jarso/core/guide";
import { describe, expect, it } from "vitest";

const id = "00000000-0000-4000-8000-0000000000a1";
const childId = "00000000-0000-4000-8000-0000000000c1";
const ctx = { currency: "GBP", id, today: "2026-11-03" };

function build(kind: Parameters<typeof draftFromFields>[0], fields: ActionFields, extra = {}) {
  return draftFromFields(kind, fields, { ...ctx, ...extra });
}

describe("missingActionFields", () => {
  it("lists what each kind still needs", () => {
    expect(missingActionFields("money_received", { amount: "5" })).toEqual(["jar"]);
    expect(missingActionFields("purchase", { label: "crisps" })).toEqual(["amount"]);
    expect(missingActionFields("jar_move", {})).toEqual(["amount", "from"]);
    expect(missingActionFields("savings_request", { amount: "5" })).toEqual(["request"]);
    expect(missingActionFields("savings_request", { request: "emergency", amount: "5" })).toEqual([
      "reason",
    ]);
    expect(missingActionFields("hand_over_allowance", {})).toEqual(["split"]);
    expect(missingActionFields("hand_over_allowance", { saved: "2" })).toEqual([]);
    expect(missingActionFields("record_gift", { amount: "10" })).toEqual(["jar"]);
    expect(missingActionFields("change_allowance", { frequency: "weekly" })).toEqual(["amount"]);
    expect(missingActionFields("decide_request", { decision: "approve" })).toEqual(["request_id"]);
  });

  it("treats blank text as missing", () => {
    expect(missingActionFields("money_received", { amount: "  ", jar: "save" })).toEqual([
      "amount",
    ]);
  });
});

describe("draftFromFields: the child's kinds", () => {
  it("writes down money received, into the jar the child said", () => {
    expect(
      build("money_received", {
        amount: "£5",
        jar: "Save jar",
        label: "Grandma",
        category: "Family",
      }),
    ).toEqual({
      ok: true,
      draft: {
        kind: "money_received",
        id,
        amountMinor: 500,
        jar: "save",
        category: "family",
        label: "Grandma",
      },
    });
  });

  it("records a purchase from Spend, with Other when no category fits", () => {
    expect(build("purchase", { amount: "1.20", label: "crisps", category: "food" })).toMatchObject({
      ok: true,
      draft: { kind: "purchase", amountMinor: 120, category: "other", label: "crisps" },
    });
  });

  it("moves money to the other jar unless told, and never into the same one", () => {
    expect(build("jar_move", { amount: "3", from: "save" })).toMatchObject({
      ok: true,
      draft: { from: "save", to: "spend" },
    });
    expect(build("jar_move", { amount: "3", from: "save", to: "save" })).toEqual({
      ok: false,
      problem: "Money moves between two different jars.",
    });
  });

  it("asks for extra money only with a reason", () => {
    expect(build("savings_request", { request: "extra money", amount: "4" })).toEqual({
      ok: false,
      missing: ["reason"],
    });
    expect(
      build("savings_request", { request: "emergency", amount: "4", reason: "school trip" }),
    ).toMatchObject({ ok: true, draft: { request: "emergency", reason: "school trip" } });
  });

  it("counts an amount it can't read as missing, so Jarso asks instead of guessing", () => {
    expect(build("purchase", { amount: "a few quid", label: "crisps" })).toEqual({
      ok: false,
      missing: ["amount"],
    });
    expect(build("money_received", { amount: "5", jar: "piggy bank" })).toEqual({
      ok: false,
      missing: ["jar"],
    });
  });
});

describe("draftFromFields: the parent's kinds", () => {
  it("hands over what is due, splitting the rest into the other part", () => {
    const due = { id: "00000000-0000-4000-8000-0000000000d1", amountMinor: 1000 };
    expect(build("hand_over_allowance", { saved: "4" }, { childId, due })).toMatchObject({
      ok: true,
      draft: { occurrenceId: due.id, cashMinor: 600, savedMinor: 400 },
    });
    expect(
      build("hand_over_allowance", { cash: "10", saved: "0" }, { childId, due }),
    ).toMatchObject({ ok: true, draft: { cashMinor: 1000, savedMinor: 0 } });
    expect(build("hand_over_allowance", { cash: "5" }, { childId })).toEqual({
      ok: false,
      problem: "Nothing is waiting to be handed over.",
    });
  });

  it("changes the allowance, keeping how often unless told and never dating it in the past", () => {
    const schedule = {
      id: "00000000-0000-4000-8000-0000000000e1",
      frequency: "weekly" as const,
      nextDueOn: "2026-11-01",
    };
    expect(build("change_allowance", { amount: "6" }, { childId, schedule })).toMatchObject({
      ok: true,
      draft: { amountMinor: 600, frequency: "weekly", nextOn: "2026-11-03" },
    });
    expect(
      build("change_allowance", { amount: "20", frequency: "every month" }, { childId, schedule }),
    ).toMatchObject({ ok: true, draft: { frequency: "monthly" } });
  });

  it("decides only a request the app found waiting", () => {
    const request = {
      id: "00000000-0000-4000-8000-0000000000f1",
      kind: "withdrawal" as const,
      amountMinor: 300,
    };
    expect(
      build("decide_request", { request_id: request.id, decision: "yes" }, { childId, request }),
    ).toMatchObject({
      ok: true,
      draft: { approve: true, amountMinor: 300, request: "withdrawal" },
    });
    expect(
      build("decide_request", { request_id: request.id, decision: "maybe" }, { childId, request }),
    ).toEqual({ ok: false, missing: ["decision"] });
    expect(
      build("decide_request", { request_id: request.id, decision: "no" }, { childId }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });
});

describe("isActionKindFor", () => {
  it("keeps children's and parents' kinds apart", () => {
    expect(isActionKindFor("purchase", "child")).toBe(true);
    expect(isActionKindFor("purchase", "parent")).toBe(false);
    expect(isActionKindFor("decide_request", "parent")).toBe(true);
    expect(isActionKindFor("decide_request", "child")).toBe(false);
  });
});

describe("formProblem", () => {
  it("passes a draft the app's own form accepts", () => {
    const built = build("purchase", { amount: "1.20", label: "crisps" });
    expect(built.ok && formProblem(built.draft, "GBP", ctx.today)).toBeNull();
  });

  it("refuses what the form would refuse", () => {
    const draft = {
      kind: "change_allowance",
      id,
      childId,
      scheduleId: "00000000-0000-4000-8000-0000000000e1",
      amountMinor: 600,
      frequency: "weekly",
      nextOn: "2026-10-01",
    } as ActionDraft;
    expect(formProblem(draft, "GBP", ctx.today)).toBe("Pick today or a later date.");
  });
});

describe("actionDraftSchema", () => {
  it("rejects a draft with fields its kind doesn't have", () => {
    expect(
      actionDraftSchema.safeParse({
        kind: "purchase",
        id,
        amountMinor: 100,
        category: "snacks",
        label: null,
        jar: "save",
      }).success,
    ).toBe(false);
  });
});

describe("describeDraft", () => {
  it("shows every field in plain words", () => {
    const built = build("money_received", { amount: "5", jar: "save", label: "Grandma" });
    expect(built.ok && describeDraft(built.draft, "GBP")).toEqual({
      kind: "action",
      draft: expect.objectContaining({ kind: "money_received" }),
      title: "Write down money you got",
      lines: [
        { label: "Amount", value: "£5" },
        { label: "Into", value: "Save" },
        { label: "Kind", value: "Other" },
        { label: "From", value: "Grandma" },
      ],
    });
  });

  it("names the child on a parent's card", () => {
    const due = { id: "00000000-0000-4000-8000-0000000000d1", amountMinor: 1000 };
    const built = build("hand_over_allowance", { cash: "10" }, { childId, due });
    expect(built.ok && describeDraft(built.draft, "GBP", "Sam").title).toBe(
      "Hand over the allowance for Sam",
    );
  });
});

describe("proposalFromStored", () => {
  it("shows a stored draft's card again and drops one that no longer reads", () => {
    const built = build("jar_move", { amount: "2", from: "spend" });
    if (!built.ok) throw new Error("draft");
    expect(proposalFromStored({ type: "action", draft: built.draft }, "GBP")).toMatchObject({
      kind: "action",
      title: "Move money into Save",
    });
    expect(
      proposalFromStored(
        { type: "action", draft: { ...built.draft, amountMinor: -1 } as ActionDraft },
        "GBP",
      ),
    ).toBeNull();
  });
});
