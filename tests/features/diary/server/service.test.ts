import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/features/auth/server", () => ({ assertUser: vi.fn() }));
vi.mock("@/features/family/server", () => ({ assertRole: vi.fn() }));
vi.mock("@/features/diary/server/repository", () => ({
  callRecordPurchase: vi.fn(),
  callRecordMoneyReceived: vi.fn(),
  callUndoDiaryEntry: vi.fn(),
  callCorrectDiaryEntry: vi.fn(),
  callListEntryVersions: vi.fn(),
}));

const auth = await import("@/features/auth/server");
const family = await import("@/features/family/server");
const repo = await import("@/features/diary/server/repository");
const service = await import("@/features/diary/server/service");

const child = { id: "child-1", email: "c@example.com" };
const input = { amountMinor: 500, idempotencyKey: "key-1", category: "snacks" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(family.assertRole).mockResolvedValue({ user: child, membership: null });
});

describe("recordPurchase", () => {
  it("records for the signed-in child, not an input id", async () => {
    vi.mocked(repo.callRecordPurchase).mockResolvedValue({ status: "recorded", entryId: "e1" });
    await expect(service.recordPurchase({ ...input, label: "Snack" })).resolves.toEqual({
      status: "recorded",
      entryId: "e1",
    });
    expect(family.assertRole).toHaveBeenCalledWith("child");
    expect(repo.callRecordPurchase).toHaveBeenCalledWith(
      { kind: "user" },
      {
        childId: "child-1",
        amountMinor: 500,
        label: "Snack",
        idempotencyKey: "key-1",
        category: "snacks",
      },
    );
  });

  it("forwards occurredAt to the RPC", async () => {
    vi.mocked(repo.callRecordPurchase).mockResolvedValue({ status: "recorded", entryId: "e1" });
    await service.recordPurchase({ ...input, occurredAt: "2026-10-29T10:00:00Z" });
    expect(repo.callRecordPurchase).toHaveBeenCalledWith(
      { kind: "user" },
      {
        childId: "child-1",
        amountMinor: 500,
        label: "",
        idempotencyKey: "key-1",
        category: "snacks",
        occurredAt: "2026-10-29T10:00:00Z",
      },
    );
  });

  it("passes not_enough_spend through", async () => {
    vi.mocked(repo.callRecordPurchase).mockResolvedValue({
      status: "not_enough_spend",
      freeMinor: 200,
    });
    await expect(service.recordPurchase(input)).resolves.toEqual({
      status: "not_enough_spend",
      freeMinor: 200,
    });
  });
});

describe("recordMoneyReceived", () => {
  it("records for the signed-in child with the jar and category", async () => {
    vi.mocked(repo.callRecordMoneyReceived).mockResolvedValue({
      status: "recorded",
      entryId: "e2",
    });
    await expect(
      service.recordMoneyReceived({
        amountMinor: 2000,
        jar: "save",
        category: "birthday",
        label: "Nani",
        idempotencyKey: "key-2",
      }),
    ).resolves.toEqual({ status: "recorded", entryId: "e2" });
    expect(family.assertRole).toHaveBeenCalledWith("child");
    expect(repo.callRecordMoneyReceived).toHaveBeenCalledWith(
      { kind: "user" },
      {
        childId: "child-1",
        amountMinor: 2000,
        jar: "save",
        category: "birthday",
        label: "Nani",
        idempotencyKey: "key-2",
      },
    );
  });
});

describe("undoDiaryEntry", () => {
  it("returns the other results", async () => {
    for (const r of ["undone", "already_undone", "not_enough_spend", "not_enough_save"] as const) {
      vi.mocked(repo.callUndoDiaryEntry).mockResolvedValue(r);
      await expect(service.undoDiaryEntry("e1")).resolves.toBe(r);
    }
  });

  it("maps too_late to CONFLICT", async () => {
    vi.mocked(repo.callUndoDiaryEntry).mockResolvedValue("too_late");
    await expect(service.undoDiaryEntry("e1")).rejects.toMatchObject({
      code: "CONFLICT",
      message: "You can only undo within a day.",
    });
  });
});

describe("correctDiaryEntry", () => {
  const fix = { entryId: "e1", amountMinor: 350, category: "snacks", idempotencyKey: "k" };

  it("asserts a child and passes the input to the repository", async () => {
    vi.mocked(repo.callCorrectDiaryEntry).mockResolvedValue({ status: "fixed", entryId: "e9" });
    await expect(service.correctDiaryEntry(fix)).resolves.toEqual({
      status: "fixed",
      entryId: "e9",
    });
    expect(family.assertRole).toHaveBeenCalledWith("child");
    expect(repo.callCorrectDiaryEntry).toHaveBeenCalledWith(
      { kind: "user" },
      { ...fix, label: "" },
    );
  });

  it("passes every status through, including freeMinor", async () => {
    for (const r of [
      { status: "unchanged" },
      { status: "not_fixable" },
      { status: "not_enough_spend", freeMinor: 120 },
      { status: "not_enough_save" },
    ] as const) {
      vi.mocked(repo.callCorrectDiaryEntry).mockResolvedValue(r);
      await expect(service.correctDiaryEntry(fix)).resolves.toEqual(r);
    }
  });
});

describe("listEntryVersions", () => {
  it("needs a user, not a child", async () => {
    const rows = [{ id: "a", amountMinor: 500, category: "snacks", label: "", createdAt: "t" }];
    vi.mocked(repo.callListEntryVersions).mockResolvedValue(rows);
    await expect(service.listEntryVersions("e1")).resolves.toEqual(rows);
    expect(auth.assertUser).toHaveBeenCalled();
    expect(family.assertRole).not.toHaveBeenCalled();
  });
});
