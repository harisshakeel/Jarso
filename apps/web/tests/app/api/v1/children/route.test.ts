// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

const assertRole = vi.fn();
const addChild = vi.fn();
const withNicknameConflict = vi.fn();
vi.mock("@/features/family/server", () => ({ addChild, assertRole, withNicknameConflict }));
vi.mock("@/lib/supabase/request-scope", () => import("../fake-bearer-scope"));

const { PHONE_HEADERS, scope } = await import("../fake-bearer-scope");
const roles = await import("../parent-roles");
const { POST } = await import("@/app/api/v1/children/route");

const NEW_CHILD = "6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d";
const body = { nickname: "Sam", pin: "1234", consent: true };

const post = (input: unknown, headers: Record<string, string> = PHONE_HEADERS) =>
  POST(roles.request("/api/v1/children", "POST", input, headers));

beforeEach(() => {
  vi.clearAllMocks();
  roles.family.noFamily = false;
  scope.phoneUser = { id: roles.PARENT_ID, email: "p@example.com" };
  assertRole.mockImplementation(roles.fakeAssertRole);
  withNicknameConflict.mockImplementation(roles.fakeWithNicknameConflict);
  addChild.mockResolvedValue({ id: NEW_CHILD, nickname: "Sam" });
});

describe("POST /api/v1/children", () => {
  it("adds the child to the parent's own family and returns 201", async () => {
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { id: NEW_CHILD, nickname: "Sam" } });
    expect(assertRole).toHaveBeenCalledWith("parent");
    expect(addChild).toHaveBeenCalledWith({ ...body, familyId: roles.FAMILY_ID });
  });

  it("uses the membership's family, never one in the body", async () => {
    await post({ ...body, familyId: "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a" });
    expect(addChild).toHaveBeenCalledWith({ ...body, familyId: roles.FAMILY_ID });
  });

  it("refuses a child bearer with 403 and adds nothing", async () => {
    scope.phoneUser = { id: roles.CHILD_ID, email: null };
    const res = await post(body);
    expect(res.status).toBe(403);
    expect(addChild).not.toHaveBeenCalled();
  });

  it("refuses a parent without a family with 403", async () => {
    roles.family.noFamily = true;
    const res = await post(body);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: { code: "FORBIDDEN", message: "Set up your family first." },
    });
    expect(addChild).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body", async () => {
    const res = await post({ ...body, pin: "12" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "VALIDATION" } });
    expect(addChild).not.toHaveBeenCalled();
  });

  it("puts a taken nickname on the field with 409", async () => {
    addChild.mockRejectedValue(new AppError("CONFLICT", "That already exists."));
    const res = await post(body);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: { code: "CONFLICT", details: { nickname: [expect.any(String)] } },
    });
  });

  it("refuses a bad token with 401", async () => {
    const res = await post(body, { authorization: "Bearer stale" });
    expect(res.status).toBe(401);
    expect(addChild).not.toHaveBeenCalled();
  });
});
