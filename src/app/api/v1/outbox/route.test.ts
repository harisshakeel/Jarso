// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

const USER_ID = "8b0c2a4e-5f1d-4c3b-9a7e-2d6f8e1b3c5a";
const OTHER_ID = "1f2e3d4c-5b6a-4987-8a6b-5c4d3e2f1a0b";
const KEY = "3c9e7a1b-2d4f-4e6a-8b0c-9d1e2f3a4b5c";
const OCCURRED_AT = "2026-10-29T08:15:00.000Z";

const assertUser = vi.fn();
const getFamilyContext = vi.fn();
const recordPurchase = vi.fn();
const recordPractice = vi.fn();
const recordStep = vi.fn();
const completeMission = vi.fn();
const completeCheckIn = vi.fn();

vi.mock("@/features/auth/server", () => ({ assertUser }));
vi.mock("@/features/allowance/server", () => ({ getFamilyContext }));
vi.mock("@/features/diary/server", () => ({ recordPurchase }));
vi.mock("@/features/learning/server", () => ({
  recordPractice,
  recordStep,
  completeMission,
  completeCheckIn,
}));

const { POST } = await import("./route");

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
  payload: { amount: "2.50", label: "Snack", idempotencyKey: KEY, occurredAt: OCCURRED_AT },
  ...overrides,
});

describe("POST /api/v1/outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertUser.mockResolvedValue({ id: USER_ID });
    getFamilyContext.mockResolvedValue({ currency: "GBP" });
    recordPurchase.mockResolvedValue({ status: "recorded", entryId: KEY });
  });

  it("routes a purchase to recordPurchase with occurredAt", async () => {
    const res = await post(purchase());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { status: "recorded", entryId: KEY } });
    expect(recordPurchase).toHaveBeenCalledWith({
      amountMinor: 250,
      label: "Snack",
      idempotencyKey: KEY,
      occurredAt: OCCURRED_AT,
    });
  });

  it("ignores occurredAt for a check-in", async () => {
    completeCheckIn.mockResolvedValue({ correctCount: 4 });
    const answers = ["a", "b", "c", "d", "e"].map((stepKey) => ({
      stepKey,
      answer: { kind: "option", optionId: "x" },
    }));
    const res = await post({
      kind: "checkIn",
      userId: USER_ID,
      payload: { answers, occurredAt: OCCURRED_AT },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { correctCount: 4 } });
    expect(completeCheckIn).toHaveBeenCalledWith(answers);
  });

  it("returns 400 for an unknown kind", async () => {
    const res = await post({ kind: "transfer", userId: USER_ID, payload: {} });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "VALIDATION", message: "Please check what you entered and try again." },
    });
    expect(recordPurchase).not.toHaveBeenCalled();
  });

  it("returns a child-safe message for an invalid payload", async () => {
    const res = await post(purchase({ payload: { amount: "lots", idempotencyKey: KEY } }));
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

  it("rejects a cross-origin POST with 403", async () => {
    const res = await post(purchase(), { origin: "https://evil.example", host: "localhost:3000" });
    expect(res.status).toBe(403);
    expect(assertUser).not.toHaveBeenCalled();
  });
});
