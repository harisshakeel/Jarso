// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

const assertRole = vi.fn();
const currentRole = vi.fn();
const getGuideState = vi.fn();
const getParentGuideState = vi.fn();
vi.mock("@/features/family/server", () => ({ assertRole, currentRole }));
vi.mock("@/features/guide/server", () => ({ getGuideState, getParentGuideState }));
vi.mock("@/lib/supabase/request-scope", () => import("../../fake-bearer-scope"));

const { PHONE_HEADERS, scope } = await import("../../fake-bearer-scope");
const roles = await import("../../parent-roles");
const { GET } = await import("@/app/api/v1/guide/state/route");

const { CHILD_ID, PARENT_ID } = roles;

const get = (headers: Record<string, string> = PHONE_HEADERS) =>
  GET(new Request("http://localhost:3000/api/v1/guide/state", { headers }));

beforeEach(() => {
  vi.clearAllMocks();
  scope.entered = 0;
  scope.phoneUser = { id: CHILD_ID, email: null };
  assertRole.mockImplementation(roles.fakeAssertRole);
  currentRole.mockImplementation(roles.fakeCurrentRole);
  getGuideState.mockResolvedValue({ available: true, introNeeded: false });
  // As the real service: refused unless the caller is a parent.
  getParentGuideState.mockImplementation(async () => {
    await roles.fakeAssertRole("parent");
    return { configured: true, enabledChildIds: [CHILD_ID] };
  });
});

describe("GET /api/v1/guide/state", () => {
  it("returns the bearer child's guide state", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { available: true, introNeeded: false } });
    expect(assertRole).toHaveBeenCalledWith("child");
    expect(getGuideState).toHaveBeenCalledWith(CHILD_ID);
    expect(getParentGuideState).not.toHaveBeenCalled();
    expect(scope.entered).toBe(1);
  });

  it("returns the parent's state: the switch and their children with Jarso on", async () => {
    scope.phoneUser = { id: PARENT_ID, email: "p@example.com" };
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { configured: true, enabledChildIds: [CHILD_ID] },
    });
    expect(assertRole).toHaveBeenCalledWith("parent");
    expect(getGuideState).not.toHaveBeenCalled();
  });

  it("tells a parent the guide is off", async () => {
    scope.phoneUser = { id: PARENT_ID, email: "p@example.com" };
    getParentGuideState.mockResolvedValue({ configured: false, enabledChildIds: [] });
    const res = await get();
    expect(await res.json()).toEqual({ data: { configured: false, enabledChildIds: [] } });
  });

  it("passes a parent's refusal (profile not finished) through as 403", async () => {
    scope.phoneUser = { id: PARENT_ID, email: "p@example.com" };
    assertRole.mockRejectedValue(new AppError("FORBIDDEN", "Finish your profile first."));
    const res = await get();
    expect(res.status).toBe(403);
    expect(getParentGuideState).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller with 401", async () => {
    const res = await get({});
    expect(res.status).toBe(401);
    expect(getGuideState).not.toHaveBeenCalled();
    expect(getParentGuideState).not.toHaveBeenCalled();
  });

  it("refuses a bad token with 401", async () => {
    const res = await get({ authorization: "Bearer stale" });
    expect(res.status).toBe(401);
    expect(getGuideState).not.toHaveBeenCalled();
  });
});
