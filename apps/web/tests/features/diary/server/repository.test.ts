import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { callCorrectDiaryEntry, callListEntryVersions, callRecordMoneyReceived } = await import(
  "@/features/diary/server/repository"
);

// biome-ignore lint/suspicious/noExplicitAny: a minimal fake client
const fake = (data: unknown) => ({ rpc: vi.fn(async () => ({ data, error: null })) }) as any;

describe("callRecordMoneyReceived", () => {
  it("maps the RPC args", async () => {
    const db = fake({ status: "recorded", entry_id: "e1" });
    await expect(
      callRecordMoneyReceived(db, {
        childId: "c",
        amountMinor: 100,
        jar: "save",
        category: "found",
        label: "x",
        idempotencyKey: "k",
      }),
    ).resolves.toEqual({ status: "recorded", entryId: "e1" });
    expect(db.rpc).toHaveBeenCalledWith("record_money_received", {
      p_child_id: "c",
      p_amount_minor: 100,
      p_jar: "save",
      p_category: "found",
      p_label: "x",
      p_idempotency_key: "k",
    });
  });
});

describe("callCorrectDiaryEntry", () => {
  const input = { entryId: "e", amountMinor: 1, category: "other", label: "", idempotencyKey: "k" };

  it("maps each status", async () => {
    await expect(
      callCorrectDiaryEntry(fake({ status: "fixed", entry_id: "n" }), input),
    ).resolves.toEqual({ status: "fixed", entryId: "n" });
    await expect(
      callCorrectDiaryEntry(fake({ status: "not_enough_spend", free_minor: 7 }), input),
    ).resolves.toEqual({ status: "not_enough_spend", freeMinor: 7 });
    for (const status of ["unchanged", "not_fixable", "not_enough_save"] as const) {
      await expect(callCorrectDiaryEntry(fake({ status }), input)).resolves.toEqual({ status });
    }
  });

  it("throws on an unknown result", async () => {
    await expect(callCorrectDiaryEntry(fake({ status: "??" }), input)).rejects.toMatchObject({
      code: "INTERNAL",
    });
  });
});

describe("callListEntryVersions", () => {
  it("maps rows to camelCase", async () => {
    const db = fake([{ id: "a", amount_minor: 5, category: null, label: "l", created_at: "t" }]);
    await expect(callListEntryVersions(db, "e")).resolves.toEqual([
      { id: "a", amountMinor: 5, category: null, label: "l", createdAt: "t" },
    ]);
  });
});
