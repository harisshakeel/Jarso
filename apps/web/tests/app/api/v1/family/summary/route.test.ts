// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const assertRole = vi.fn();
const getFamilyDashboard = vi.fn();
const isGuideConfigured = vi.fn();
const writeFamilySummary = vi.fn();
vi.mock("@/features/family/server", () => ({ assertRole }));
vi.mock("@/features/dashboard/server", () => ({ getFamilyDashboard }));
vi.mock("@/features/guide/server", () => ({ isGuideConfigured, writeFamilySummary }));
vi.mock("@/lib/supabase/request-scope", () => import("../../fake-bearer-scope"));

const { PHONE_HEADERS, scope } = await import("../../fake-bearer-scope");
const roles = await import("../../parent-roles");
const { GET } = await import("@/app/api/v1/family/summary/route");

const dashboard = { currency: "GBP", timezone: "Europe/London", today: "2026-11-04", children: [] };

const get = (query: string, headers: Record<string, string> = PHONE_HEADERS) =>
  GET(new Request(`http://localhost:3000/api/v1/family/summary${query}`, { headers }));

beforeEach(() => {
  vi.clearAllMocks();
  scope.phoneUser = { id: roles.PARENT_ID, email: "p@example.com" };
  assertRole.mockImplementation(roles.fakeAssertRole);
  isGuideConfigured.mockReturnValue(true);
  getFamilyDashboard.mockResolvedValue(dashboard);
  writeFamilySummary.mockResolvedValue("A calm week.");
});

describe("GET /api/v1/family/summary", () => {
  it("writes the summary from the dashboard's facts for the period", async () => {
    const res = await get("?days=30");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { text: "A calm week." } });
    expect(assertRole).toHaveBeenCalledWith("parent");
    expect(getFamilyDashboard).toHaveBeenCalledWith(30);
    expect(writeFamilySummary).toHaveBeenCalledWith(
      expect.objectContaining({ period: expect.any(String), names: [], lines: [] }),
    );
  });

  it("returns null text with nothing read when the guide is off", async () => {
    isGuideConfigured.mockReturnValue(false);
    const res = await get("?days=7");
    expect(await res.json()).toEqual({ data: { text: null } });
    expect(getFamilyDashboard).not.toHaveBeenCalled();
    expect(writeFamilySummary).not.toHaveBeenCalled();
  });

  it("returns null text without a family", async () => {
    getFamilyDashboard.mockResolvedValue(null);
    const res = await get("?days=7");
    expect(await res.json()).toEqual({ data: { text: null } });
    expect(writeFamilySummary).not.toHaveBeenCalled();
  });

  it("refuses a child bearer with 403 before reading anything", async () => {
    scope.phoneUser = { id: roles.CHILD_ID, email: null };
    const res = await get("?days=7");
    expect(res.status).toBe(403);
    expect(getFamilyDashboard).not.toHaveBeenCalled();
    expect(writeFamilySummary).not.toHaveBeenCalled();
  });

  it("returns 400 for a period the dashboard doesn't offer", async () => {
    expect((await get("?days=14")).status).toBe(400);
    expect((await get("?days=abc")).status).toBe(400);
    expect((await get("")).status).toBe(400);
    expect(getFamilyDashboard).not.toHaveBeenCalled();
  });

  it("refuses a bad token with 401", async () => {
    const res = await get("?days=7", { authorization: "Bearer stale" });
    expect(res.status).toBe(401);
  });
});
