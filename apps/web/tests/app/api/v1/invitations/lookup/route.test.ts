// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

const INVITATION_GONE = "This invitation has expired or was already used.";
const assertRole = vi.fn();
const findInvitation = vi.fn();
vi.mock("@/features/family/server", () => ({ assertRole, findInvitation, INVITATION_GONE }));
vi.mock("@/lib/supabase/request-scope", () => import("../../fake-bearer-scope"));

const { PHONE_HEADERS, scope } = await import("../../fake-bearer-scope");
const roles = await import("../../parent-roles");
const { POST } = await import("@/app/api/v1/invitations/lookup/route");

const INVITATION = "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a";

const post = (input: unknown, headers: Record<string, string> = PHONE_HEADERS) =>
  POST(roles.request("/api/v1/invitations/lookup", "POST", input, headers));

beforeEach(() => {
  vi.clearAllMocks();
  scope.phoneUser = { id: roles.PARENT_ID, email: "p@example.com" };
  assertRole.mockImplementation(roles.fakeAssertRole);
  findInvitation.mockResolvedValue({ id: INVITATION, nickname: "Sam" });
});

describe("POST /api/v1/invitations/lookup", () => {
  it("returns the child's nickname only, never the invitation id", async () => {
    const res = await post({ invite: " ABCD-EFGH " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { nickname: "Sam" } });
    expect(assertRole).toHaveBeenCalledWith("parent");
    expect(findInvitation).toHaveBeenCalledWith("ABCD-EFGH");
  });

  it("returns 404 with INVITATION_GONE for an unknown invite", async () => {
    findInvitation.mockResolvedValue(null);
    const res = await post({ invite: "nope" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: { code: "NOT_FOUND", message: INVITATION_GONE },
    });
  });

  it("refuses a child bearer with 403 and looks nothing up", async () => {
    scope.phoneUser = { id: roles.CHILD_ID, email: null };
    const res = await post({ invite: "ABCD-EFGH" });
    expect(res.status).toBe(403);
    expect(findInvitation).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body", async () => {
    const res = await post({ invite: "" });
    expect(res.status).toBe(400);
    expect(findInvitation).not.toHaveBeenCalled();
  });

  it("passes the service's rate limit through as 429", async () => {
    findInvitation.mockRejectedValue(new AppError("RATE_LIMITED", "Too many tries."));
    const res = await post({ invite: "ABCD-EFGH" });
    expect(res.status).toBe(429);
  });
});
