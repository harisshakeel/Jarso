import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/features/auth/server", () => ({ assertUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("./repository", () => ({
  encodeCursor: (n: { createdAt: string; id: string }) => `${n.createdAt}|${n.id}`,
  listNoticeRows: vi.fn(),
  fetchUnreadCount: vi.fn(),
  setRead: vi.fn(),
}));

const repo = await import("./repository");
const { listNotices, getUnreadCount, markRead } = await import("./service");

const notice = (i: number) => ({
  id: `n${i}`,
  kind: "allowance_due" as const,
  childId: "c1",
  childName: "Maya",
  sourceType: "allowance_occurrence" as const,
  sourceId: `s${i}`,
  payload: {},
  createdAt: `2026-10-30T09:${String(59 - i).padStart(2, "0")}:00Z`,
  read: false,
});

beforeEach(() => vi.clearAllMocks());

describe("listNotices", () => {
  it("returns nextBefore when a full page comes back", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => notice(i));
    vi.mocked(repo.listNoticeRows).mockResolvedValue(rows);
    const page = await listNotices();
    expect(page.items).toHaveLength(20);
    expect(page.nextBefore).toBe(`${rows[19]?.createdAt}|n19`);
  });

  it("cursor carries the id so a same-timestamp group is not skipped", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      ...notice(i),
      createdAt: "2026-10-30T09:00:00Z",
    }));
    vi.mocked(repo.listNoticeRows).mockResolvedValue(rows);
    const page = await listNotices();
    expect(page.nextBefore).toBe("2026-10-30T09:00:00Z|n19");
  });

  it("returns no cursor on a short page", async () => {
    vi.mocked(repo.listNoticeRows).mockResolvedValue([notice(0)]);
    await expect(listNotices()).resolves.toEqual({ items: [notice(0)], nextBefore: null });
  });

  it("passes limit and cursor to the repository", async () => {
    vi.mocked(repo.listNoticeRows).mockResolvedValue([]);
    await listNotices(20, "2026-10-30T00:00:00Z");
    expect(repo.listNoticeRows).toHaveBeenCalledWith({ kind: "user" }, 20, "2026-10-30T00:00:00Z");
  });
});

describe("getUnreadCount and markRead", () => {
  it("delegates to the repository", async () => {
    vi.mocked(repo.fetchUnreadCount).mockResolvedValue(3);
    vi.mocked(repo.setRead).mockResolvedValue(2);
    await expect(getUnreadCount()).resolves.toBe(3);
    await expect(markRead(null)).resolves.toBe(2);
    expect(repo.setRead).toHaveBeenCalledWith({ kind: "user" }, null);
  });
});
