import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, toAppError } from "@/lib";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/features/auth/server", () => ({ assertUser: vi.fn() }));
vi.mock("@/features/family/server", () => ({
  assertParentOf: vi.fn(),
  assertRole: vi.fn(),
  assertSelfOrParentOf: vi.fn(),
  getFamily: vi.fn(),
}));
vi.mock("./repository", () => ({
  cancelPendingGift: vi.fn(),
  changeGift: vi.fn(),
  changeSchedule: vi.fn(),
  closeOccurrence: vi.fn(),
  confirmGiftHandover: vi.fn(),
  confirmOccurrenceHandover: vi.fn(),
  fetchNextDueOn: vi.fn(),
  findGift: vi.fn(),
  findLatestAllowanceSplit: vi.fn(),
  findLatestGiftSplit: vi.fn(),
  findLatestSchedule: vi.fn(),
  findOccurrenceChildId: vi.fn(),
  findScheduleChildId: vi.fn(),
  insertGift: vi.fn(),
  insertSchedule: vi.fn(),
  listDueForParent: vi.fn(),
  listPendingGifts: vi.fn(),
  pauseSchedule: vi.fn(),
  resumeSchedule: vi.fn(),
  stopSchedule: vi.fn(),
}));

const family = await import("@/features/family/server");
const repo = await import("./repository");
const service = await import("./service");

const parent = { id: "parent-1", email: "p@example.com" };
const childId = "child-1";
const gift = {
  id: "gift-1",
  childId,
  amountMinor: 1000,
  giveOn: "2026-10-20",
  note: null,
  status: "pending" as const,
};
const conflict = () => toAppError({ code: "JA409", message: "Allowance has stopped" }, "x");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.mocked(family.assertParentOf).mockResolvedValue(parent);
  vi.mocked(family.assertRole).mockResolvedValue({ user: parent, membership: null });
  vi.mocked(family.getFamily).mockResolvedValue({
    id: "fam-1",
    code: "ABC234",
    currency: "GBP",
    timezone: "UTC",
  });
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
    () => service.createGift({ childId, amountMinor: 1000, giveOn: "2026-11-01", note: null }),
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
  repo.insertSchedule,
  repo.changeSchedule,
  repo.pauseSchedule,
  repo.resumeSchedule,
  repo.stopSchedule,
  repo.insertGift,
  repo.changeGift,
  repo.cancelPendingGift,
  repo.confirmOccurrenceHandover,
  repo.confirmGiftHandover,
  repo.closeOccurrence,
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
    expect(repo.stopSchedule).not.toHaveBeenCalled();
  });
});

describe("conflicts", () => {
  it("turns a JA409 from the repository into a CONFLICT with a fitting message", async () => {
    vi.mocked(repo.changeSchedule).mockRejectedValue(conflict());

    const error = await service
      .changeAllowance({
        scheduleId: "s-1",
        amountMinor: 500,
        frequency: "weekly",
        nextOn: "2026-11-01",
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: "CONFLICT",
      message: "This allowance has stopped. Set up a new one.",
    });
  });

  it("explains a CONFLICT on a duplicate allowance", async () => {
    vi.mocked(repo.insertSchedule).mockRejectedValue(conflict());

    await expect(
      service.createAllowance({
        childId,
        amountMinor: 500,
        frequency: "weekly",
        firstOn: "2026-11-01",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "There's already an allowance. Change it instead.",
    });
  });

  it("leaves other errors alone", async () => {
    vi.mocked(repo.stopSchedule).mockRejectedValue(new AppError("INTERNAL", "boom"));
    await expect(service.stopAllowance("s-1")).rejects.toMatchObject({ code: "INTERNAL" });
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

  it("passes already_confirmed through", async () => {
    vi.mocked(repo.confirmOccurrenceHandover).mockResolvedValue("already_confirmed");

    await expect(service.confirmHandover(input)).resolves.toBe("already_confirmed");
    expect(repo.confirmOccurrenceHandover).toHaveBeenCalledWith(expect.anything(), {
      id: "occ-1",
      cashMinor: 300,
      savedMinor: 200,
      idempotencyKey: "key-1",
    });
  });

  it("routes gifts to the gift handover", async () => {
    vi.mocked(repo.confirmGiftHandover).mockResolvedValue("confirmed");

    await expect(service.confirmHandover({ ...input, kind: "gift", id: "gift-1" })).resolves.toBe(
      "confirmed",
    );
    expect(repo.confirmOccurrenceHandover).not.toHaveBeenCalled();
  });
});

describe("markNotGiven", () => {
  it("passes already_handled through", async () => {
    vi.mocked(repo.closeOccurrence).mockResolvedValue("already_handled");
    await expect(service.markNotGiven("occ-1")).resolves.toBe("already_handled");
  });
});

describe("updateGift", () => {
  it("keeps an unchanged past date (a due gift)", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-29T12:00:00Z"), toFake: ["Date"] });
    await service.updateGift({
      giftId: "gift-1",
      amountMinor: 900,
      giveOn: "2026-10-20",
      note: null,
    });
    expect(repo.changeGift).toHaveBeenCalled();
  });

  it("rejects a changed date before today", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-29T12:00:00Z"), toFake: ["Date"] });
    await expect(
      service.updateGift({ giftId: "gift-1", amountMinor: 900, giveOn: "2026-10-21", note: null }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(repo.changeGift).not.toHaveBeenCalled();
  });
});

describe("getLastSplit", () => {
  it("uses the most recent of allowance and gift handovers", async () => {
    vi.mocked(repo.findLatestAllowanceSplit).mockResolvedValue({
      cash: 300,
      saved: 200,
      at: "2026-10-20T10:00:00Z",
    });
    vi.mocked(repo.findLatestGiftSplit).mockResolvedValue({
      cash: 0,
      saved: 1000,
      at: "2026-10-25T10:00:00Z",
    });

    await expect(service.getLastSplit(childId)).resolves.toEqual({ cash: 0, saved: 1000 });
  });

  it("is null before the first handover", async () => {
    vi.mocked(repo.findLatestAllowanceSplit).mockResolvedValue(null);
    vi.mocked(repo.findLatestGiftSplit).mockResolvedValue(null);
    await expect(service.getLastSplit(childId)).resolves.toBeNull();
  });
});

describe("getSchedule", () => {
  it("skips the next date for a stopped schedule", async () => {
    vi.mocked(repo.findLatestSchedule).mockResolvedValue({
      id: "s-1",
      amountMinor: 500,
      frequency: "weekly",
      status: "stopped",
      pausedThrough: null,
      pauseMessage: null,
    });

    await expect(service.getSchedule(childId)).resolves.toMatchObject({
      status: "stopped",
      nextDueOn: null,
    });
    expect(repo.fetchNextDueOn).not.toHaveBeenCalled();
    expect(family.assertSelfOrParentOf).toHaveBeenCalledWith(childId);
  });
});
