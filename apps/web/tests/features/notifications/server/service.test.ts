import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ kind: "admin" })) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ kind: "user" })) }));
vi.mock("@/features/auth/server", () => ({ assertUser: vi.fn(async () => ({ id: "u1" })) }));
vi.mock("@/features/notifications/server/repository", () => ({
  listNotices: vi.fn(),
  listUnreadRows: vi.fn(),
  fetchUnreadCount: vi.fn(),
  markRead: vi.fn(),
  hitRateLimit: vi.fn(),
}));

const repo = await import("@/features/notifications/server/repository");
const { allowDispatch, listNotices, listUnreadNotices, getUnreadCount, markRead, describeAgent } =
  await import("@/features/notifications/server/service");

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
  it("delegates to the shared read for the signed-in user", async () => {
    const page = { items: [notice(0)], nextBefore: null };
    vi.mocked(repo.listNotices).mockResolvedValue(page);
    await expect(listNotices(20, "2026-10-30T00:00:00Z")).resolves.toBe(page);
    expect(repo.listNotices).toHaveBeenCalledWith({ kind: "user" }, "u1", {
      limit: 20,
      before: "2026-10-30T00:00:00Z",
    });
  });
});

describe("getUnreadCount and markRead", () => {
  it("delegates to the repository", async () => {
    vi.mocked(repo.fetchUnreadCount).mockResolvedValue(3);
    vi.mocked(repo.markRead).mockResolvedValue(2);
    await expect(getUnreadCount()).resolves.toBe(3);
    await expect(markRead(null)).resolves.toBe(2);
    expect(repo.markRead).toHaveBeenCalledWith({ kind: "user" }, null);
  });
});

describe("listUnreadNotices", () => {
  it("asks the database for unread notices of the given kinds, newest first, at most 20", async () => {
    vi.mocked(repo.listUnreadRows).mockResolvedValue([notice(0)]);
    await expect(listUnreadNotices(["limit_exceeded"])).resolves.toEqual([notice(0)]);
    expect(repo.listUnreadRows).toHaveBeenCalledWith({ kind: "user" }, ["limit_exceeded"], 20);
  });
});

describe("describeAgent", () => {
  it.each([
    ["Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36", "Chrome on Android"],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile Safari/604.1",
      "Safari on iPhone",
    ],
    ["Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36 Edg/130", "Edge on Windows"],
    ["Mozilla/5.0 (Macintosh) Firefox/131.0", "Firefox on Macintosh"],
    ["curl/8.0", null],
    [null, null],
  ])("%s → %s", (agent, expected) => {
    expect(describeAgent(agent)).toBe(expected);
  });
});

describe("allowDispatch", () => {
  it("hits the per-user limit: 30 per 10 minutes", async () => {
    vi.mocked(repo.hitRateLimit).mockResolvedValue(false);
    await expect(allowDispatch("u1")).resolves.toBe(false);
    expect(repo.hitRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "push:dispatch:u1",
      "10 minutes",
      30,
    );
  });
});
