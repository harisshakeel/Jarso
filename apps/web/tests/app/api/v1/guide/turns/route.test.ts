// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const CHILD_ID = "8b0c2a4e-5f1d-4c3b-9a7e-2d6f8e1b3c5a";
const PARENT_ID = "1f2e3d4c-5b6a-4987-8a6b-5c4d3e2f1a0b";

const prepareGuideTurn = vi.fn();
const streamGuideTurn = vi.fn();
vi.mock("@/features/guide/server", () => ({ prepareGuideTurn, streamGuideTurn }));
vi.mock("@/lib/supabase/request-scope", () => import("../../fake-bearer-scope"));

const { PHONE_HEADERS, scope } = await import("../../fake-bearer-scope");
const { POST } = await import("@/app/api/v1/guide/turns/route");

const input = {
  clientMessageId: "00000000-0000-4000-8000-000000000001",
  conversationId: null,
  context: { entry: "home" },
  text: "How much do I have?",
};

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost:3000/api/v1/guide/turns", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  scope.entered = 0;
  scope.phoneUser = { id: CHILD_ID, email: null };
  // The real prepareGuideTurn finds its child through getCurrentUser(); record who that was.
  prepareGuideTurn.mockImplementation(async () => ({ asker: scope.user?.id ?? "cookie" }));
  streamGuideTurn.mockImplementation(
    (turn: { asker: string }) =>
      new Response(`${JSON.stringify({ type: "status", text: turn.asker })}\n`),
  );
});

describe("POST /api/v1/guide/turns", () => {
  it("runs the turn as the bearer's child", async () => {
    const res = await post(input, PHONE_HEADERS);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(CHILD_ID);
    expect(scope.entered).toBe(1);
    expect(prepareGuideTurn).toHaveBeenCalledWith(input);
  });

  it("runs a parent's turn about their child as the bearer's parent", async () => {
    scope.phoneUser = { id: PARENT_ID, email: "p@example.com" };
    const parentInput = { ...input, context: { entry: "parent", childId: CHILD_ID } };
    const res = await post(parentInput, PHONE_HEADERS);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(PARENT_ID);
    expect(prepareGuideTurn).toHaveBeenCalledWith(parentInput);
  });

  it("still runs on the cookie session without a header", async () => {
    const res = await post(input);
    expect(await res.text()).toContain("cookie");
    expect(scope.entered).toBe(0);
  });

  it("refuses a bad token with JSON 401 before anything streams", async () => {
    const res = await post(input, { authorization: "Bearer stale" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect(prepareGuideTurn).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body", async () => {
    const res = await post({ ...input, text: "" }, PHONE_HEADERS);
    expect(res.status).toBe(400);
    expect(prepareGuideTurn).not.toHaveBeenCalled();
  });
});
