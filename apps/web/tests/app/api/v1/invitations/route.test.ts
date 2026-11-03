// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

const assertRole = vi.fn();
const acceptInvitation = vi.fn();
const acceptListedInvitation = vi.fn();
const withNicknameConflict = vi.fn();
vi.mock("@/features/family/server", () => ({
  acceptInvitation,
  acceptListedInvitation,
  assertRole,
  withNicknameConflict,
}));
vi.mock("@/lib/supabase/request-scope", () => import("../fake-bearer-scope"));

const { PHONE_HEADERS, scope } = await import("../fake-bearer-scope");
const roles = await import("../parent-roles");
const { POST } = await import("@/app/api/v1/invitations/route");

const NEW_CHILD = "6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d";
const INVITATION = "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a";
const byCode = { invite: "ABCD-EFGH", pin: "1234", consent: true };
const byId = { invitationId: INVITATION, pin: "1234", consent: true };

const post = (input: unknown, headers: Record<string, string> = PHONE_HEADERS) =>
  POST(roles.request("/api/v1/invitations", "POST", input, headers));

beforeEach(() => {
  vi.clearAllMocks();
  scope.phoneUser = { id: roles.PARENT_ID, email: "p@example.com" };
  assertRole.mockImplementation(roles.fakeAssertRole);
  withNicknameConflict.mockImplementation(roles.fakeWithNicknameConflict);
  acceptInvitation.mockResolvedValue({ id: NEW_CHILD, nickname: "Sam" });
  acceptListedInvitation.mockResolvedValue({ id: NEW_CHILD, nickname: "Sam" });
});

describe("POST /api/v1/invitations", () => {
  it("accepts a pasted link or code", async () => {
    const res = await post(byCode);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: NEW_CHILD, nickname: "Sam" } });
    expect(acceptInvitation).toHaveBeenCalledWith(byCode);
    expect(acceptListedInvitation).not.toHaveBeenCalled();
  });

  it("accepts an invitation from the parent's own list", async () => {
    const res = await post(byId);
    expect(res.status).toBe(200);
    expect(acceptListedInvitation).toHaveBeenCalledWith(byId);
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("refuses a child bearer with 403 and accepts nothing", async () => {
    scope.phoneUser = { id: roles.CHILD_ID, email: null };
    const res = await post(byCode);
    expect(res.status).toBe(403);
    expect(acceptInvitation).not.toHaveBeenCalled();
    expect(acceptListedInvitation).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body", async () => {
    const res = await post({ pin: "1234", consent: true });
    expect(res.status).toBe(400);
    expect(acceptInvitation).not.toHaveBeenCalled();
    expect(acceptListedInvitation).not.toHaveBeenCalled();
  });

  it("puts a taken nickname on the field with 409", async () => {
    acceptInvitation.mockRejectedValue(new AppError("CONFLICT", "That already exists."));
    const res = await post(byCode);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: { code: "CONFLICT", details: { nickname: [expect.any(String)] } },
    });
  });

  it("passes a gone invitation through as 404", async () => {
    acceptInvitation.mockRejectedValue(new AppError("NOT_FOUND", "This invitation has expired."));
    const res = await post(byCode);
    expect(res.status).toBe(404);
  });
});
