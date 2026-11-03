// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const assertRole = vi.fn();
const removeChild = vi.fn();
vi.mock("@/features/family/server", () => ({ assertRole, removeChild }));
vi.mock("@/lib/supabase/request-scope", () => import("../../fake-bearer-scope"));

const { PHONE_HEADERS, scope } = await import("../../fake-bearer-scope");
const roles = await import("../../parent-roles");
const { DELETE } = await import("@/app/api/v1/children/[childId]/route");

const TARGET = "6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d";

const del = (childId: string, headers: Record<string, string> = PHONE_HEADERS) =>
  DELETE(roles.request(`/api/v1/children/${childId}`, "DELETE", undefined, headers), {
    params: Promise.resolve({ childId }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  scope.phoneUser = { id: roles.PARENT_ID, email: "p@example.com" };
  assertRole.mockImplementation(roles.fakeAssertRole);
  removeChild.mockResolvedValue(undefined);
});

describe("DELETE /api/v1/children/[childId]", () => {
  it("removes the child and returns ok", async () => {
    const res = await del(TARGET);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });
    expect(assertRole).toHaveBeenCalledWith("parent");
    expect(removeChild).toHaveBeenCalledWith({ childId: TARGET });
  });

  it("refuses a child bearer with 403 and removes nothing", async () => {
    scope.phoneUser = { id: roles.CHILD_ID, email: null };
    const res = await del(TARGET);
    expect(res.status).toBe(403);
    expect(removeChild).not.toHaveBeenCalled();
  });

  it("returns 400 for a child id that is not a UUID", async () => {
    const res = await del("not-a-uuid");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "VALIDATION" } });
    expect(removeChild).not.toHaveBeenCalled();
  });

  it("refuses a bad token with 401", async () => {
    const res = await del(TARGET, { authorization: "Bearer stale" });
    expect(res.status).toBe(401);
    expect(removeChild).not.toHaveBeenCalled();
  });
});
