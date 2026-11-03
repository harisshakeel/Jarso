import { beforeEach, describe, expect, it, vi } from "vitest";

const db = { kind: "user" };
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => db) }));
vi.mock("@/features/auth/server", () => ({ assertUser: vi.fn() }));
vi.mock("@/features/family/server", () => ({ currentRole: vi.fn() }));
vi.mock("@/features/guide/server", () => ({ isGuideConfigured: vi.fn(() => true) }));
vi.mock("@jarso/data/dashboard", () => ({ getFamilyDashboard: vi.fn() }));

const auth = await import("@/features/auth/server");
const family = await import("@/features/family/server");
const data = await import("@jarso/data/dashboard");
const { getFamilyDashboard } = await import("@/features/dashboard/server/service");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.assertUser).mockResolvedValue({ id: "parent-1", email: null });
  vi.mocked(family.currentRole).mockResolvedValue("parent");
  vi.mocked(data.getFamilyDashboard).mockResolvedValue(null);
});

describe("getFamilyDashboard", () => {
  it("passes the parent, the period, the server clock and the guide switch", async () => {
    await getFamilyDashboard(30);
    expect(data.getFamilyDashboard).toHaveBeenCalledWith(db, {
      userId: "parent-1",
      days: 30,
      now: expect.any(Date),
      guideOn: true,
    });
  });

  it("rejects a child without reading", async () => {
    vi.mocked(family.currentRole).mockResolvedValue("child");
    await expect(getFamilyDashboard(7)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(data.getFamilyDashboard).not.toHaveBeenCalled();
  });
});
