import { beforeEach, describe, expect, it, vi } from "vitest";

// The parent's dashboard composition: the shared reads are mocked, so these pin which reads are
// required, which fall back, and how the chats are counted.

vi.mock("../../src/family", () => ({
  findMembership: vi.fn(),
  findFamilyById: vi.fn(),
  listChildMembers: vi.fn(),
}));
vi.mock("../../src/requests", () => ({ getAvailability: vi.fn() }));
vi.mock("../../src/allowance", () => ({
  listDueForParent: vi.fn(),
  getParentSchedule: vi.fn(),
  listGiftsFor: vi.fn(),
}));
vi.mock("../../src/goals", () => ({ getGoalView: vi.fn() }));
vi.mock("../../src/ledger", () => ({ getHistorySince: vi.fn(), getBalanceHistory: vi.fn() }));
vi.mock("../../src/guide", () => ({ listChildChats: vi.fn() }));

const family = await import("../../src/family");
const requests = await import("../../src/requests");
const allowance = await import("../../src/allowance");
const goals = await import("../../src/goals");
const ledger = await import("../../src/ledger");
const guide = await import("../../src/guide");
const { getFamilyDashboard } = await import("@jarso/data/dashboard");

const db = { kind: "user" } as never;
// Wednesday 2026-11-04 in UTC: the week started on Monday 2026-11-02.
const now = new Date("2026-11-04T12:00:00Z");
const opts = { userId: "parent-1", days: 7, now, guideOn: true };

const chat = (flagged: boolean, lastMessageAt: string) =>
  ({ id: lastMessageAt, flagged, lastMessageAt }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(family.findMembership).mockResolvedValue({
    familyId: "fam-1",
    role: "parent",
    status: "approved",
  });
  vi.mocked(family.findFamilyById).mockResolvedValue({
    id: "fam-1",
    code: "ABC234",
    currency: "GBP",
    timezone: "UTC",
  });
  vi.mocked(family.listChildMembers).mockResolvedValue([
    { id: "child-1", nickname: "Ada" },
  ] as never);
  vi.mocked(requests.getAvailability).mockResolvedValue({
    spendMinor: 300,
    saveMinor: 500,
    reservedSaveMinor: 100,
  } as never);
  vi.mocked(allowance.listDueForParent).mockResolvedValue([]);
  vi.mocked(allowance.getParentSchedule).mockResolvedValue(null);
  vi.mocked(allowance.listGiftsFor).mockResolvedValue([]);
  vi.mocked(goals.getGoalView).mockResolvedValue({ goal: { id: "goal-1" } } as never);
  vi.mocked(ledger.getHistorySince).mockResolvedValue([]);
  vi.mocked(ledger.getBalanceHistory).mockResolvedValue(null as never);
  vi.mocked(guide.listChildChats).mockResolvedValue([]);
});

describe("getFamilyDashboard", () => {
  it("no family → null", async () => {
    vi.mocked(family.findMembership).mockResolvedValue(null);
    await expect(getFamilyDashboard(db, opts)).resolves.toBeNull();
    expect(requests.getAvailability).not.toHaveBeenCalled();
  });

  it("builds each child from the shared reads, in the family's timezone", async () => {
    const result = await getFamilyDashboard(db, opts);
    expect(result).toMatchObject({ currency: "GBP", timezone: "UTC", today: "2026-11-04" });
    expect(result?.children[0]).toMatchObject({
      id: "child-1",
      nickname: "Ada",
      slot: 1,
      spendMinor: 300,
      saveMinor: 500,
      reservedMinor: 100,
      goal: { goal: { id: "goal-1" } },
      flaggedChats: 0,
    });
    expect(allowance.getParentSchedule).toHaveBeenCalledWith(db, "child-1", "parent-1");
    expect(allowance.listGiftsFor).toHaveBeenCalledWith(db, "child-1", "parent-1");
    expect(ledger.getBalanceHistory).toHaveBeenCalledWith(db, "child-1", { timezone: "UTC", now });
    // The period before this week starts 2026-10-22; history reads from the day before.
    expect(ledger.getHistorySince).toHaveBeenCalledWith(db, "child-1", "2026-10-21", {
      timezone: "UTC",
      now: now.getTime(),
    });
  });

  it("a failed goal read leaves goal null, page still built", async () => {
    vi.mocked(goals.getGoalView).mockRejectedValue(new Error("boom"));
    const result = await getFamilyDashboard(db, opts);
    expect(result?.children[0]?.goal).toBeNull();
  });

  it("a failed jars read rejects", async () => {
    vi.mocked(requests.getAvailability).mockRejectedValue(new Error("boom"));
    await expect(getFamilyDashboard(db, opts)).rejects.toThrow("boom");
  });

  it("guideOn false reads no chats", async () => {
    const result = await getFamilyDashboard(db, { ...opts, guideOn: false });
    expect(guide.listChildChats).not.toHaveBeenCalled();
    expect(result?.children[0]?.flaggedChats).toBe(0);
  });

  it("flaggedChats counts this week only", async () => {
    vi.mocked(guide.listChildChats).mockResolvedValue([
      chat(true, "2026-11-03T09:00:00Z"),
      chat(true, "2026-11-01T09:00:00Z"),
      chat(false, "2026-11-04T09:00:00Z"),
    ]);
    const result = await getFamilyDashboard(db, opts);
    expect(result?.children[0]?.flaggedChats).toBe(1);
  });
});
