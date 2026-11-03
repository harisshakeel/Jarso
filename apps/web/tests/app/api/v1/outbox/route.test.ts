// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

const USER_ID = "8b0c2a4e-5f1d-4c3b-9a7e-2d6f8e1b3c5a";
const OTHER_ID = "1f2e3d4c-5b6a-4987-8a6b-5c4d3e2f1a0b";
const uuid = "3c9e7a1b-2d4f-4e6a-8b0c-9d1e2f3a4b5c";
const NOW = Date.parse("2026-10-30T12:00:00.000Z");
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ATTEMPT = "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a";

const assertUser = vi.fn();
const getFamilyContext = vi.fn();
const recordPurchase = vi.fn();
const recordPractice = vi.fn();
const recordStep = vi.fn();
const completeMission = vi.fn();
const completeCheckIn = vi.fn();
const pushAfterNotices = vi.fn();

vi.mock("@/features/auth/server", () => ({ assertUser }));
vi.mock("@/lib/supabase/request-scope", () => import("../fake-bearer-scope"));
vi.mock("@/features/allowance/server", () => ({ getFamilyContext }));
vi.mock("@/features/diary/server", () => ({ recordPurchase }));
vi.mock("@/features/notifications/server", () => ({ pushAfterNotices }));
vi.mock("@/features/learning/server", () => ({
  recordPractice,
  recordStep,
  completeMission,
  completeCheckIn,
}));

const { PHONE_HEADERS, scope } = await import("../fake-bearer-scope");
const { POST } = await import("@/app/api/v1/outbox/route");

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost:3000/api/v1/outbox", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

const purchase = (overrides: Record<string, unknown> = {}) => ({
  kind: "purchase",
  userId: USER_ID,
  ageMs: 5 * MINUTE,
  payload: { amount: "2.50", label: "Snack", idempotencyKey: uuid },
  ...overrides,
});

const ago = (ms: number) => new Date(NOW - ms).toISOString();

const answer = { kind: "option", optionId: "x" };

describe("POST /api/v1/outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scope.entered = 0;
    assertUser.mockResolvedValue({ id: USER_ID });
    getFamilyContext.mockResolvedValue({ currency: "GBP" });
    recordPurchase.mockResolvedValue({ status: "recorded", entryId: uuid });
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });
  afterEach(() => vi.restoreAllMocks());

  it("routes a purchase to recordPurchase with a time from its age", async () => {
    const res = await post(purchase());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { status: "recorded", entryId: uuid } });
    expect(recordPurchase).toHaveBeenCalledWith({
      amountMinor: 250,
      label: "Snack",
      idempotencyKey: uuid,
      category: "other",
      occurredAt: ago(5 * MINUTE),
    });
    expect(pushAfterNotices).toHaveBeenCalledTimes(1);
  });

  it("keeps a queued category, and a purchase queued before categories posts as other", async () => {
    await post(purchase({ payload: { amount: "2.50", category: "games", idempotencyKey: uuid } }));
    expect(recordPurchase).toHaveBeenLastCalledWith(expect.objectContaining({ category: "games" }));
    await post(purchase({ payload: { amount: "2.50", idempotencyKey: uuid } }));
    expect(recordPurchase).toHaveBeenLastCalledWith(expect.objectContaining({ category: "other" }));
  });

  it("ignores a client occurredAt, so a clock 1 h fast records at the server's now", async () => {
    const fast = new Date(NOW + 60 * MINUTE).toISOString();
    const res = await post(
      purchase({ ageMs: 0, payload: { amount: "2.50", idempotencyKey: uuid, occurredAt: fast } }),
    );
    expect(res.status).toBe(200);
    expect(recordPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ occurredAt: new Date(NOW).toISOString() }),
    );
  });

  it("pins an age over 7 days inside the database's limit", async () => {
    await post(purchase({ ageMs: 30 * DAY }));
    expect(recordPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ occurredAt: ago(7 * DAY - MINUTE) }),
    );
  });

  it.each([{ ageMs: -1 }, { ageMs: 1.5 }, { ageMs: "5" }, { ageMs: undefined }])(
    "returns 400 for ageMs %o",
    async (overrides) => {
      const res = await post(purchase(overrides));
      expect(res.status).toBe(400);
      expect(recordPurchase).not.toHaveBeenCalled();
    },
  );

  it("routes a practice answer to recordPractice with the server-computed time", async () => {
    recordPractice.mockResolvedValue({ correct: true });
    const payload = { itemKey: "late-1", answer, hintsUsed: 0, tries: 1 };
    const res = await post({ kind: "practice", userId: USER_ID, ageMs: DAY, payload });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { correct: true } });
    expect(recordPractice).toHaveBeenCalledWith({ ...payload, occurredAt: ago(DAY) });
  });

  it("routes a step to recordStep without a time", async () => {
    recordStep.mockResolvedValue({ correct: false });
    const payload = {
      attemptId: ATTEMPT,
      stepKey: "how-many",
      phase: "main",
      answer,
      hintsUsed: 1,
      tries: 2,
    };
    const res = await post({ kind: "step", userId: USER_ID, ageMs: MINUTE, payload });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { correct: false } });
    expect(recordStep).toHaveBeenCalledWith(payload);
  });

  it("routes completeMission with the attempt and the server-computed time", async () => {
    completeMission.mockResolvedValue({ correctCount: 3 });
    const res = await post({
      kind: "completeMission",
      userId: USER_ID,
      ageMs: 2 * MINUTE,
      payload: { attemptId: ATTEMPT, occurredAt: new Date(NOW + DAY).toISOString() },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { correctCount: 3 } });
    expect(completeMission).toHaveBeenCalledWith(ATTEMPT, ago(2 * MINUTE));
  });

  it("ignores occurredAt for a check-in", async () => {
    completeCheckIn.mockResolvedValue({ correctCount: 4 });
    const answers = ["a", "b", "c", "d", "e"].map((stepKey) => ({ stepKey, answer }));
    const res = await post({
      kind: "checkIn",
      userId: USER_ID,
      ageMs: 0,
      payload: { answers, occurredAt: ago(0) },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { correctCount: 4 } });
    expect(completeCheckIn).toHaveBeenCalledWith(answers);
  });

  it("returns 400 for an unknown kind", async () => {
    const res = await post({ kind: "transfer", userId: USER_ID, ageMs: 0, payload: {} });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "VALIDATION", message: "Please check what you entered and try again." },
    });
    expect(recordPurchase).not.toHaveBeenCalled();
  });

  it("returns a child-safe message for an invalid payload", async () => {
    const res = await post(purchase({ payload: { amount: "lots", idempotencyKey: uuid } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "VALIDATION", message: "Please check what you entered and try again." },
    });
    expect(recordPurchase).not.toHaveBeenCalled();
  });

  it("returns 401 when assertRole throws UNAUTHORIZED", async () => {
    recordPurchase.mockRejectedValue(new AppError("UNAUTHORIZED", "Please sign in again."));
    const res = await post(purchase());
    expect(res.status).toBe(401);
  });

  it("returns 401 when userId does not match the session", async () => {
    const res = await post(purchase({ userId: OTHER_ID }));
    expect(res.status).toBe(401);
    expect(getFamilyContext).not.toHaveBeenCalled();
    expect(recordPurchase).not.toHaveBeenCalled();
  });

  it("turns not_enough_spend into a 409 with the jar sentence", async () => {
    recordPurchase.mockResolvedValue({ status: "not_enough_spend", freeMinor: 120 });
    const res = await post(purchase());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: {
        code: "CONFLICT",
        message:
          "That's more than you have in Spend (£1.20). Record money you got first, or ask a parent.",
      },
    });
  });

  it("returns 503 when a service throws UNAVAILABLE", async () => {
    recordPurchase.mockRejectedValue(
      new AppError("UNAVAILABLE", "Jarso is taking a while. Please try again."),
    );
    const res = await post(purchase());
    expect(res.status).toBe(503);
  });

  describe("from the phone (bearer)", () => {
    const COOKIE_ID = "6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d";
    beforeEach(() => {
      scope.phoneUser = { id: USER_ID, email: null };
      // As the real getCurrentUser: the scope's user inside a bearer scope, else the cookie user.
      assertUser.mockImplementation(async () => scope.user ?? { id: COOKIE_ID, email: null });
    });

    it("runs the item as the token's user", async () => {
      const res = await post(purchase(), PHONE_HEADERS);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: { status: "recorded", entryId: uuid } });
      expect(scope.entered).toBe(1);
      expect(recordPurchase).toHaveBeenCalledTimes(1);
    });

    it("still refuses an item queued by another child with 401", async () => {
      const res = await post(purchase({ userId: OTHER_ID }), PHONE_HEADERS);
      expect(res.status).toBe(401);
      expect(recordPurchase).not.toHaveBeenCalled();
    });

    it("refuses a bad token with 401 and never runs as the cookie user", async () => {
      const res = await post(purchase({ userId: COOKIE_ID }), { authorization: "Bearer stale" });
      expect(res.status).toBe(401);
      expect(assertUser).not.toHaveBeenCalled();
      expect(recordPurchase).not.toHaveBeenCalled();
    });
  });

  it("rejects a cross-origin POST with 403", async () => {
    const res = await post(purchase(), { origin: "https://evil.example", host: "localhost:3000" });
    expect(res.status).toBe(403);
    expect(assertUser).not.toHaveBeenCalled();
  });
});
