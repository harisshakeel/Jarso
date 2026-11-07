import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, familyToday } from "@/lib";

// The write and parent-read logic (conflict lines, handover results, gift dates, splits) is
// shared and tested in packages/data/tests/allowance; these tests cover auth and wiring.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/features/auth/server", () => ({ assertUser: vi.fn() }));
vi.mock("@jarso/data/family", () => ({ getFamilyContext: vi.fn() }));
vi.mock("@/features/family/server", () => ({
  assertParentCanRead: vi.fn(),
  assertParentOf: vi.fn(),
  assertRole: vi.fn(),
  assertSelfOrParentOf: vi.fn(),
  getFamily: vi.fn(),
}));
vi.mock("@/features/allowance/server/repository", () => ({
  fetchNextDueOn: vi.fn(),
  findGift: vi.fn(),
  findLatestConfirmedOccurrence: vi.fn(),
  findOccurrenceChildId: vi.fn(),
  findScheduleChildId: vi.fn(),
  findScheduleRow: vi.fn(),
  listDueForParent: vi.fn(),
  markPlanDecided: vi.fn(),
  sumDueOccurrences: vi.fn(),
}));
vi.mock("@jarso/data/allowance", () => ({
  cancelGift: vi.fn(),
  changeAllowance: vi.fn(),
  confirmHandover: vi.fn(),
  createAllowance: vi.fn(),
  createGift: vi.fn(),
  getLastSplitWith: vi.fn(),
  getHandoverPrefillWith: vi.fn(),
  getParentSchedule: vi.fn(),
  listGiftsFor: vi.fn(),
  markNotGiven: vi.fn(),
  pauseAllowance: vi.fn(),
  resumeAllowance: vi.fn(),
  stopAllowance: vi.fn(),
  updateGift: vi.fn(),
}));

const auth = await import("@/features/auth/server");
const sharedFamily = await import("@jarso/data/family");
const family = await import("@/features/family/server");
const repo = await import("@/features/allowance/server/repository");
const shared = await import("@jarso/data/allowance");
const service = await import("@/features/allowance/server/service");

const parent = { id: "parent-1", email: "p@example.com" };
const childId = "child-1";
const db = { kind: "user" };
const gift = {
  id: "gift-1",
  childId,
  amountMinor: 1000,
  giveOn: "2026-10-20",
  note: null,
  status: "pending" as const,
  autoCharge: false,
  autoChargeProvider: null,
  autoChargeBy: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.mocked(family.assertParentOf).mockResolvedValue(parent);
  vi.mocked(family.assertParentCanRead).mockResolvedValue(parent);
  vi.mocked(family.assertRole).mockResolvedValue({ user: parent, membership: null });
  vi.mocked(auth.assertUser).mockResolvedValue(parent);
  vi.mocked(sharedFamily.getFamilyContext).mockImplementation(async () => ({
    currency: "GBP",
    timezone: "UTC",
    today: familyToday("UTC"),
  }));
  vi.mocked(repo.findScheduleChildId).mockResolvedValue(childId);
  vi.mocked(repo.findOccurrenceChildId).mockResolvedValue(childId);
  vi.mocked(repo.findGift).mockResolvedValue(gift);
});

const mutations: [string, () => Promise<unknown>][] = [
  [
    "createAllowance",
    () =>
      service.createAllowance({
        childId,
        amountMinor: 500,
        frequency: "weekly",
        firstOn: "2026-11-01",
      }),
  ],
  [
    "changeAllowance",
    () =>
      service.changeAllowance({
        scheduleId: "s-1",
        amountMinor: 500,
        frequency: "monthly",
        nextOn: "2026-11-01",
      }),
  ],
  [
    "pauseAllowance",
    () => service.pauseAllowance({ scheduleId: "s-1", through: null, message: null }),
  ],
  ["resumeAllowance", () => service.resumeAllowance("s-1")],
  ["stopAllowance", () => service.stopAllowance("s-1")],
  [
    "createGift",
    () =>
      service.createGift({
        childId,
        amountMinor: 1000,
        giveOn: "2026-11-01",
        note: null,
        idempotencyKey: "gift-key-1",
      }),
  ],
  [
    "updateGift",
    () =>
      service.updateGift({ giftId: "gift-1", amountMinor: 900, giveOn: "2026-10-20", note: null }),
  ],
  ["cancelGift", () => service.cancelGift("gift-1")],
  [
    "confirmHandover (allowance)",
    () =>
      service.confirmHandover({
        kind: "allowance",
        id: "occ-1",
        cashMinor: 300,
        savedMinor: 200,
        idempotencyKey: "key-1",
      }),
  ],
  [
    "confirmHandover (gift)",
    () =>
      service.confirmHandover({
        kind: "gift",
        id: "gift-1",
        cashMinor: 1000,
        savedMinor: 0,
        idempotencyKey: "key-1",
      }),
  ],
  ["markNotGiven", () => service.markNotGiven("occ-1")],
];

const writes = [
  shared.createAllowance,
  shared.changeAllowance,
  shared.pauseAllowance,
  shared.resumeAllowance,
  shared.stopAllowance,
  shared.createGift,
  shared.updateGift,
  shared.cancelGift,
  shared.confirmHandover,
  shared.markNotGiven,
];

describe("parent mutations", () => {
  it.each(mutations)("%s rejects and writes nothing when assertParentOf throws", async (_, run) => {
    vi.mocked(family.assertParentOf).mockRejectedValue(new AppError("FORBIDDEN", "You can't."));

    await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  });

  it.each(mutations)("%s checks the parent of the row's child", async (_, run) => {
    await run().catch(() => undefined);
    expect(family.assertParentOf).toHaveBeenCalledWith(childId);
  });

  it("rejects a schedule the caller can't see without writing", async () => {
    vi.mocked(repo.findScheduleChildId).mockResolvedValue(null);

    await expect(service.stopAllowance("s-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(family.assertRole).toHaveBeenCalledWith("parent");
    expect(shared.stopAllowance).not.toHaveBeenCalled();
  });

  it("rejects a gift the caller can't see without writing", async () => {
    vi.mocked(repo.findGift).mockResolvedValue(null);

    await expect(service.cancelGift("gift-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(shared.cancelGift).not.toHaveBeenCalled();
  });

  it("passes the planned Save on to the shared allowance writes", async () => {
    const create = {
      childId,
      amountMinor: 500,
      frequency: "weekly" as const,
      firstOn: "2026-11-01",
      saveMinor: 100,
    };
    await service.createAllowance(create);
    expect(shared.createAllowance).toHaveBeenCalledWith(db, create);
    vi.mocked(repo.findScheduleChildId).mockResolvedValue(childId);
    const change = {
      scheduleId: "s-1",
      amountMinor: 600,
      frequency: "weekly" as const,
      nextOn: "2026-11-08",
      saveMinor: 0,
    };
    await service.changeAllowance(change);
    expect(shared.changeAllowance).toHaveBeenCalledWith(db, change);
  });

  it("passes the caller's client and input to the shared write", async () => {
    const input = { scheduleId: "s-1", through: "2026-11-10", message: null };
    await service.pauseAllowance(input);
    expect(shared.pauseAllowance).toHaveBeenCalledWith(db, input);
  });
});

describe("confirmHandover", () => {
  const input = {
    kind: "allowance" as const,
    id: "occ-1",
    cashMinor: 300,
    savedMinor: 200,
    idempotencyKey: "key-1",
  };

  it("checks the occurrence's child, then passes the shared result through", async () => {
    vi.mocked(shared.confirmHandover).mockResolvedValue("already_confirmed");

    await expect(service.confirmHandover(input)).resolves.toBe("already_confirmed");
    expect(repo.findOccurrenceChildId).toHaveBeenCalledWith(db, "occ-1");
    expect(shared.confirmHandover).toHaveBeenCalledWith(db, input);
  });

  it("checks a gift's child through the gift", async () => {
    vi.mocked(shared.confirmHandover).mockResolvedValue("confirmed");

    await service.confirmHandover({ ...input, kind: "gift", id: "gift-1" });
    expect(repo.findGift).toHaveBeenCalledWith(db, "gift-1");
    expect(repo.findOccurrenceChildId).not.toHaveBeenCalled();
  });
});

describe("markNotGiven", () => {
  it("passes already_handled through", async () => {
    vi.mocked(shared.markNotGiven).mockResolvedValue("already_handled");
    await expect(service.markNotGiven("occ-1")).resolves.toBe("already_handled");
  });
});

describe("updateGift", () => {
  it("gives the shared write the family's today", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-29T12:00:00Z"), toFake: ["Date"] });
    const input = { giftId: "gift-1", amountMinor: 900, giveOn: "2026-10-20", note: null };
    await service.updateGift(input);
    expect(shared.updateGift).toHaveBeenCalledWith(db, input, "2026-10-29");
  });
});

describe("parent-only reads", () => {
  // They render behind the profile dialog (ADR 0008); the action guard would throw there.
  it.each([
    ["listDue", () => service.listDue(childId)],
    ["listGifts", () => service.listGifts(childId)],
    ["getLastSplit", () => service.getLastSplit(childId)],
  ])("%s checks parenthood without the profile gate", async (_, run) => {
    vi.mocked(repo.listDueForParent).mockResolvedValue([]);
    vi.mocked(shared.listGiftsFor).mockResolvedValue([]);
    vi.mocked(shared.getLastSplitWith).mockResolvedValue(null);

    await run();
    expect(family.assertParentCanRead).toHaveBeenCalledWith(childId);
    expect(family.assertParentOf).not.toHaveBeenCalled();
  });
});

describe("getLastSplit", () => {
  it("reads the shared split with the caller's client", async () => {
    vi.mocked(shared.getLastSplitWith).mockResolvedValue({ cash: 0, saved: 1000 });
    await expect(service.getLastSplit(childId)).resolves.toEqual({ cash: 0, saved: 1000 });
    expect(shared.getLastSplitWith).toHaveBeenCalledWith(db, childId);
  });

  it("getLastSplitWith is the shared read and checks no session", async () => {
    expect(service.getLastSplitWith).toBe(shared.getLastSplitWith);
  });
});

describe("getSchedule", () => {
  const row = {
    id: "s-1",
    amountMinor: 500,
    frequency: "weekly" as const,
    status: "stopped" as const,
    anchorOn: "2026-11-01",
    pausedThrough: null,
    pauseMessage: null,
    saveMinor: null,
  };

  it("gives a parent the shared parent schedule for their id", async () => {
    vi.mocked(family.assertSelfOrParentOf).mockResolvedValue({ id: "parent-1", email: null });
    const schedule = {
      ...row,
      nextDueOn: null,
      autoCharge: true,
      autoChargeProvider: "stripe" as const,
      autoChargeMine: true,
    };
    vi.mocked(shared.getParentSchedule).mockResolvedValue(schedule);

    await expect(service.getSchedule(childId)).resolves.toBe(schedule);
    expect(shared.getParentSchedule).toHaveBeenCalledWith(db, childId, "parent-1");
    expect(family.assertSelfOrParentOf).toHaveBeenCalledWith(childId);
  });

  it("never shows auto charge to the child, and skips the next date when stopped", async () => {
    vi.mocked(family.assertSelfOrParentOf).mockResolvedValue({ id: childId, email: null });
    vi.mocked(repo.findScheduleRow).mockResolvedValue(row);

    const forChild = await service.getSchedule(childId);
    expect(forChild).toMatchObject({
      status: "stopped",
      nextDueOn: null,
      autoCharge: false,
      autoChargeProvider: null,
      autoChargeMine: false,
    });
    expect(forChild).not.toHaveProperty("autoChargeBy");
    expect(repo.fetchNextDueOn).not.toHaveBeenCalled();
    // The child's read never asks for auto charge: the database would refuse it.
    expect(shared.getParentSchedule).not.toHaveBeenCalled();
  });
});

describe("getTodaysAllowance", () => {
  const occurrence = {
    id: "occ-1",
    cashMinor: 800,
    savedMinor: 200,
    // 23:30 UTC on the 2nd is already the 3rd in Kolkata.
    confirmedAt: "2026-11-02T23:30:00Z",
    planDecidedAt: null,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T06:00:00Z"));
    vi.mocked(family.getFamily).mockResolvedValue({
      id: "fam-1",
      code: "ABC234",
      currency: "INR",
      timezone: "Asia/Kolkata",
    });
  });

  it("returns an allowance handed over today in the family's timezone", async () => {
    vi.mocked(repo.findLatestConfirmedOccurrence).mockResolvedValue(occurrence);
    await expect(service.getTodaysAllowance(childId)).resolves.toEqual({
      occurrenceId: "occ-1",
      cashMinor: 800,
      savedMinor: 200,
      confirmedAt: occurrence.confirmedAt,
      planDecided: false,
    });
  });

  it("flags a plan already taken or dismissed", async () => {
    vi.mocked(repo.findLatestConfirmedOccurrence).mockResolvedValue({
      ...occurrence,
      planDecidedAt: "2026-11-03T05:00:00Z",
    });
    expect((await service.getTodaysAllowance(childId))?.planDecided).toBe(true);
  });

  it("is null for another day's handover, an all-Save one, or none", async () => {
    vi.mocked(repo.findLatestConfirmedOccurrence).mockResolvedValue({
      ...occurrence,
      confirmedAt: "2026-11-02T10:00:00Z",
    });
    expect(await service.getTodaysAllowance(childId)).toBeNull();
    vi.mocked(repo.findLatestConfirmedOccurrence).mockResolvedValue({
      ...occurrence,
      cashMinor: 0,
    });
    expect(await service.getTodaysAllowance(childId)).toBeNull();
    vi.mocked(repo.findLatestConfirmedOccurrence).mockResolvedValue(null);
    expect(await service.getTodaysAllowance(childId)).toBeNull();
  });
});

describe("listGifts", () => {
  it("lists the shared gifts for the viewing parent", async () => {
    vi.mocked(shared.listGiftsFor).mockResolvedValue([]);
    await service.listGifts(childId);
    expect(shared.listGiftsFor).toHaveBeenCalledWith(db, childId, "parent-1");
  });
});

describe("matchSaving", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
    vi.mocked(shared.createGift).mockResolvedValue("gift-9");
    vi.mocked(repo.findGift).mockResolvedValue({ ...gift, id: "gift-9", giveOn: "2026-10-30" });
  });

  it("gives a gift today, noted as a match, and hands all of it over into Save", async () => {
    vi.mocked(shared.confirmHandover).mockResolvedValue("confirmed");
    await expect(
      service.matchSaving({ childId, amountMinor: 700, idempotencyKey: "key-1" }),
    ).resolves.toBe("confirmed");
    expect(shared.createGift).toHaveBeenCalledWith(db, {
      childId,
      amountMinor: 700,
      giveOn: "2026-10-30",
      note: "Matching your saving",
      idempotencyKey: "key-1",
    });
    expect(shared.confirmHandover).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ kind: "gift", id: "gift-9", cashMinor: 0, savedMinor: 700 }),
    );
  });

  it("a retry after a lost response adds nothing twice", async () => {
    // The same key returns the same gift, and its handover is already done.
    vi.mocked(shared.confirmHandover).mockResolvedValue("already_confirmed");
    await expect(
      service.matchSaving({ childId, amountMinor: 700, idempotencyKey: "key-1" }),
    ).resolves.toBe("already_confirmed");
  });

  it("is refused for anyone but the child's parent, before any money moves", async () => {
    vi.mocked(family.assertParentOf).mockRejectedValue(
      new AppError("FORBIDDEN", "You can't do that."),
    );
    await expect(
      service.matchSaving({ childId, amountMinor: 700, idempotencyKey: "key-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(shared.createGift).not.toHaveBeenCalled();
    expect(shared.confirmHandover).not.toHaveBeenCalled();
  });
});
