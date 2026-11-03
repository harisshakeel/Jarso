// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

const assertRole = vi.fn();
const confirmActionDraft = vi.fn();
const pushAfterNotices = vi.fn();
vi.mock("@/features/family/server", () => ({ assertRole }));
vi.mock("@/features/guide/server", () => ({ confirmActionDraft }));
vi.mock("@/features/notifications/server", () => ({ pushAfterNotices }));
vi.mock("@/lib/supabase/request-scope", () => import("../../../fake-bearer-scope"));

const { PHONE_HEADERS, scope } = await import("../../../fake-bearer-scope");
const roles = await import("../../../parent-roles");
const { POST } = await import("@/app/api/v1/guide/drafts/confirm/route");

const ID = "0f1e2d3c-4b5a-4968-8776-655443322110";
const OCCURRENCE = "6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d";
const handover = {
  kind: "hand_over_allowance",
  id: ID,
  childId: roles.CHILD_ID,
  occurrenceId: OCCURRENCE,
  cashMinor: 500,
  savedMinor: 0,
};
const purchase = { kind: "purchase", id: ID, amountMinor: 300, category: "snacks", label: null };
const outcome = { status: "done", text: "Done.", figures: null };

const post = (input: unknown, headers: Record<string, string> = PHONE_HEADERS) =>
  POST(roles.request("/api/v1/guide/drafts/confirm", "POST", input, headers));

beforeEach(() => {
  vi.clearAllMocks();
  scope.phoneUser = { id: roles.PARENT_ID, email: "p@example.com" };
  assertRole.mockImplementation(roles.fakeAssertRole);
  confirmActionDraft.mockResolvedValue(outcome);
});

describe("POST /api/v1/guide/drafts/confirm", () => {
  it("runs a parent's draft and sends the notices it left", async () => {
    const res = await post({ draft: handover });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: outcome });
    expect(assertRole).toHaveBeenCalledWith("parent");
    expect(confirmActionDraft).toHaveBeenCalledWith(handover);
    expect(pushAfterNotices).toHaveBeenCalledTimes(1);
  });

  it("runs a child's own draft for a child bearer", async () => {
    scope.phoneUser = { id: roles.CHILD_ID, email: null };
    const res = await post({ draft: purchase });
    expect(res.status).toBe(200);
    expect(assertRole).toHaveBeenCalledWith("child");
    expect(confirmActionDraft).toHaveBeenCalledWith(purchase);
  });

  it("refuses a child bearer a parent's draft with 403 and runs nothing", async () => {
    scope.phoneUser = { id: roles.CHILD_ID, email: null };
    const res = await post({ draft: handover });
    expect(res.status).toBe(403);
    expect(confirmActionDraft).not.toHaveBeenCalled();
    expect(pushAfterNotices).not.toHaveBeenCalled();
  });

  it("refuses a parent a child's draft with 403", async () => {
    const res = await post({ draft: purchase });
    expect(res.status).toBe(403);
    expect(confirmActionDraft).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid draft", async () => {
    const res = await post({ draft: { ...handover, cashMinor: 0 } });
    expect(res.status).toBe(400);
    expect(confirmActionDraft).not.toHaveBeenCalled();
  });

  it("passes a service refusal through with its safe message", async () => {
    confirmActionDraft.mockRejectedValue(new AppError("CONFLICT", "Already handed over."));
    const res = await post({ draft: handover });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { message: "Already handed over." } });
    expect(pushAfterNotices).not.toHaveBeenCalled();
  });

  it("refuses a bad token with 401", async () => {
    const res = await post({ draft: handover }, { authorization: "Bearer stale" });
    expect(res.status).toBe(401);
    expect(confirmActionDraft).not.toHaveBeenCalled();
  });
});
