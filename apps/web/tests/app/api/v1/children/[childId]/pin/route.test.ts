// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

const assertRole = vi.fn();
const setChildPin = vi.fn();
vi.mock("@/features/family/server", () => ({ assertRole, setChildPin }));
vi.mock("@/lib/supabase/request-scope", () => import("../../../fake-bearer-scope"));

const { PHONE_HEADERS, scope } = await import("../../../fake-bearer-scope");
const roles = await import("../../../parent-roles");
const { PATCH } = await import("@/app/api/v1/children/[childId]/pin/route");

const TARGET = "6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d";
const OTHER = "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a";

const patch = (childId: string, body: unknown, headers: Record<string, string> = PHONE_HEADERS) =>
  PATCH(roles.request(`/api/v1/children/${childId}/pin`, "PATCH", body, headers), {
    params: Promise.resolve({ childId }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  scope.phoneUser = { id: roles.PARENT_ID, email: "p@example.com" };
  assertRole.mockImplementation(roles.fakeAssertRole);
  setChildPin.mockResolvedValue(undefined);
});

describe("PATCH /api/v1/children/[childId]/pin", () => {
  it("sets the PIN for the child in the path", async () => {
    const res = await patch(TARGET, { pin: "4321" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });
    expect(assertRole).toHaveBeenCalledWith("parent");
    expect(setChildPin).toHaveBeenCalledWith({ childId: TARGET, pin: "4321" });
  });

  it("uses the path's child id, never one in the body", async () => {
    await patch(TARGET, { pin: "4321", childId: OTHER });
    expect(setChildPin).toHaveBeenCalledWith({ childId: TARGET, pin: "4321" });
  });

  it("refuses a child bearer with 403 and changes nothing", async () => {
    scope.phoneUser = { id: roles.CHILD_ID, email: null };
    const res = await patch(TARGET, { pin: "4321" });
    expect(res.status).toBe(403);
    expect(setChildPin).not.toHaveBeenCalled();
  });

  it("returns 400 for a bad PIN or child id", async () => {
    expect((await patch(TARGET, { pin: "12" })).status).toBe(400);
    expect((await patch("not-a-uuid", { pin: "4321" })).status).toBe(400);
    expect(setChildPin).not.toHaveBeenCalled();
  });

  it("passes the service's refusal for someone else's child through", async () => {
    setChildPin.mockRejectedValue(new AppError("FORBIDDEN", "You can't do that."));
    const res = await patch(TARGET, { pin: "4321" });
    expect(res.status).toBe(403);
  });

  it("refuses a bad token with 401", async () => {
    const res = await patch(TARGET, { pin: "4321" }, { authorization: "Bearer stale" });
    expect(res.status).toBe(401);
    expect(setChildPin).not.toHaveBeenCalled();
  });
});
