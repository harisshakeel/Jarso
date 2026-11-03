// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

const CHILD_ID = "8b0c2a4e-5f1d-4c3b-9a7e-2d6f8e1b3c5a";
const PARENT_ID = "1f2e3d4c-5b6a-4987-8a6b-5c4d3e2f1a0b";

const assertRole = vi.fn();
const getGuideState = vi.fn();
vi.mock("@/features/family/server", () => ({ assertRole }));
vi.mock("@/features/guide/server", () => ({ getGuideState }));
vi.mock("@/lib/supabase/request-scope", () => import("../../fake-bearer-scope"));

const { PHONE_HEADERS, scope } = await import("../../fake-bearer-scope");
const { GET } = await import("@/app/api/v1/guide/state/route");

const get = (headers: Record<string, string> = PHONE_HEADERS) =>
  GET(new Request("http://localhost:3000/api/v1/guide/state", { headers }));

beforeEach(() => {
  vi.clearAllMocks();
  scope.entered = 0;
  scope.phoneUser = { id: CHILD_ID, email: null };
  // As the real assertRole: the scope's user, refused unless they have that role.
  assertRole.mockImplementation(async (role: string) => {
    const user = scope.user;
    if (!user) throw new AppError("UNAUTHORIZED", "You must be signed in");
    if ((user.id === CHILD_ID ? "child" : "parent") !== role) {
      throw new AppError("FORBIDDEN", "You can't do that.");
    }
    return { user };
  });
  getGuideState.mockResolvedValue({ available: true, introNeeded: false });
});

describe("GET /api/v1/guide/state", () => {
  it("returns the bearer child's guide state", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { available: true, introNeeded: false } });
    expect(assertRole).toHaveBeenCalledWith("child");
    expect(getGuideState).toHaveBeenCalledWith(CHILD_ID);
    expect(scope.entered).toBe(1);
  });

  it("refuses a parent with 403", async () => {
    scope.phoneUser = { id: PARENT_ID, email: null };
    const res = await get();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(getGuideState).not.toHaveBeenCalled();
  });

  it("refuses a bad token with 401", async () => {
    const res = await get({ authorization: "Bearer stale" });
    expect(res.status).toBe(401);
    expect(getGuideState).not.toHaveBeenCalled();
  });
});
