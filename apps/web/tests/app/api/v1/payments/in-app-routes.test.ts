// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

const PARENT_ID = "1f2e3d4c-5b6a-4987-8a6b-5c4d3e2f1a0b";
const CHILD_ID = "8b0c2a4e-5f1d-4c3b-9a7e-2d6f8e1b3c5a";
const ITEM_ID = "0b7e8f40-9d1a-4b2c-8e3f-1a2b3c4d5e6f";
const PAYMENT_ID = "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a";

const assertRole = vi.fn();
const service = vi.hoisted(() => ({
  startInAppPayment: vi.fn(),
  getPaymentStatus: vi.fn(),
  cancelInAppPaymentById: vi.fn(),
  setAutoChargeInApp: vi.fn(),
  removeSavedCard: vi.fn(),
  getInAppProviders: vi.fn(),
  completeFakeInApp: vi.fn(),
}));
vi.mock("@/features/family/server", () => ({ assertRole }));
vi.mock("@/features/payments/server", () => service);
vi.mock("@/lib/supabase/request-scope", () => import("../fake-bearer-scope"));

const { PHONE_HEADERS, scope } = await import("../fake-bearer-scope");
const inApp = await import("@/app/api/v1/payments/in-app/route");
const status = await import("@/app/api/v1/payments/[paymentId]/route");
const cancel = await import("@/app/api/v1/payments/[paymentId]/cancel/route");
const autoCharge = await import("@/app/api/v1/payments/auto-charge/route");
const cards = await import("@/app/api/v1/payments/cards/[provider]/route");
const providers = await import("@/app/api/v1/payments/providers/route");
const fake = await import("@/app/api/v1/payments/fake/complete/route");

const BASE = "http://localhost:3000/api/v1/payments";

function request(
  path: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = PHONE_HEADERS,
) {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

const call = {
  inApp: (body: unknown, headers?: Record<string, string>) =>
    inApp.POST(request("/in-app", "POST", body, headers)),
  status: (id: string) => status.GET(request(`/${id}`, "GET"), params({ paymentId: id })),
  cancel: (id: string, headers?: Record<string, string>) =>
    cancel.POST(request(`/${id}/cancel`, "POST", undefined, headers), params({ paymentId: id })),
  autoCharge: (body: unknown) => autoCharge.PATCH(request("/auto-charge", "PATCH", body)),
  cards: (provider: string) =>
    cards.DELETE(request(`/cards/${provider}`, "DELETE"), params({ provider })),
  providers: (query = "") => providers.GET(request(`/providers${query}`, "GET")),
  fake: (body: unknown) => fake.POST(request("/fake/complete", "POST", body)),
};

const validInApp = { kind: "allowance", id: ITEM_ID, provider: "stripe" };

beforeEach(() => {
  vi.clearAllMocks();
  scope.entered = 0;
  scope.phoneUser = { id: PARENT_ID, email: "p@example.com" };
  // As the real assertRole: the scope's user, refused unless they have that role.
  assertRole.mockImplementation(async (role: string) => {
    const user = scope.user;
    if (!user) throw new AppError("UNAUTHORIZED", "You must be signed in");
    if ((user.id === CHILD_ID ? "child" : "parent") !== role) {
      throw new AppError("FORBIDDEN", "You can't do that.");
    }
    return { user };
  });
  // The fake route checks the role inside its service, as the real one does.
  service.completeFakeInApp.mockImplementation(async () => {
    await assertRole("parent");
  });
});

describe("payments bearer routes", () => {
  it.each([
    ["POST /in-app", () => call.inApp(validInApp), service.startInAppPayment],
    ["GET /:id", () => call.status(PAYMENT_ID), service.getPaymentStatus],
    ["POST /:id/cancel", () => call.cancel(PAYMENT_ID), service.cancelInAppPaymentById],
    [
      "PATCH /auto-charge",
      () => call.autoCharge({ type: "parent_gift", id: ITEM_ID, on: false }),
      service.setAutoChargeInApp,
    ],
    ["DELETE /cards/:provider", () => call.cards("stripe"), service.removeSavedCard],
    ["GET /providers", () => call.providers(), service.getInAppProviders],
  ] as const)("refuses a child token on %s", async (_name, run, fn) => {
    scope.phoneUser = { id: CHILD_ID, email: null };
    const res = await run();
    expect(res.status).toBe(403);
    expect(fn).not.toHaveBeenCalled();
  });

  it("refuses a child token on POST /fake/complete", async () => {
    scope.phoneUser = { id: CHILD_ID, email: null };
    const res = await call.fake({ mode: "payment", ref: PAYMENT_ID, outcome: "pay" });
    expect(res.status).toBe(403);
  });

  it("answers 401 for a bad bearer token", async () => {
    const res = await call.inApp(validInApp, { authorization: "Bearer stale" });
    expect(res.status).toBe(401);
    expect(service.startInAppPayment).not.toHaveBeenCalled();
  });

  it("refuses a non-GET request from another site, bearer or not", async () => {
    const res = await call.cancel(PAYMENT_ID, { ...PHONE_HEADERS, origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(service.cancelInAppPaymentById).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/payments/in-app", () => {
  it("starts the payment as the bearer's parent and returns the sheet", async () => {
    const start = {
      paymentId: PAYMENT_ID,
      expiresAt: "2026-11-03T10:31:00.000Z",
      sheet: { provider: "fake", mode: "payment", ref: PAYMENT_ID },
    };
    service.startInAppPayment.mockResolvedValue(start);
    const res = await call.inApp(validInApp);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: start });
    expect(service.startInAppPayment).toHaveBeenCalledWith(validInApp);
  });

  it("answers 400 for an invalid body", async () => {
    const res = await call.inApp({ kind: "allowance" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "VALIDATION" } });
    expect(service.startInAppPayment).not.toHaveBeenCalled();
  });

  it("passes the service's CONFLICT through", async () => {
    service.startInAppPayment.mockRejectedValue(
      new AppError("CONFLICT", "A card payment is already in progress."),
    );
    expect((await call.inApp(validInApp)).status).toBe(409);
  });
});

describe("GET /api/v1/payments/:id", () => {
  it("returns the payment's status", async () => {
    const view = { id: PAYMENT_ID, status: "pending", failureCode: null, final: false };
    service.getPaymentStatus.mockResolvedValue(view);
    const res = await call.status(PAYMENT_ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: view });
    expect(service.getPaymentStatus).toHaveBeenCalledWith(PAYMENT_ID);
  });

  it("answers 400 for an id that is not a uuid", async () => {
    expect((await call.status("pay-1")).status).toBe(400);
    expect(service.getPaymentStatus).not.toHaveBeenCalled();
  });

  it("answers 404 for a payment the caller cannot read", async () => {
    service.getPaymentStatus.mockRejectedValue(new AppError("NOT_FOUND", "We couldn't find that."));
    expect((await call.status(PAYMENT_ID)).status).toBe(404);
  });
});

describe("POST /api/v1/payments/:id/cancel", () => {
  it("cancels and answers whether it did", async () => {
    service.cancelInAppPaymentById.mockResolvedValue({ canceled: true });
    const res = await call.cancel(PAYMENT_ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { canceled: true } });
    expect(service.cancelInAppPaymentById).toHaveBeenCalledWith(PAYMENT_ID);
  });

  it("answers 404 for a payment the caller cannot read", async () => {
    service.cancelInAppPaymentById.mockRejectedValue(
      new AppError("NOT_FOUND", "We couldn't find that."),
    );
    expect((await call.cancel(PAYMENT_ID)).status).toBe(404);
  });
});

describe("PATCH /api/v1/payments/auto-charge", () => {
  it("passes the phone through to the service", async () => {
    service.setAutoChargeInApp.mockResolvedValue({ setup: null });
    const body = {
      type: "parent_gift",
      id: ITEM_ID,
      on: true,
      provider: "razorpay",
      phone: "+91 98765 43210",
    };
    const res = await call.autoCharge(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { setup: null } });
    expect(service.setAutoChargeInApp).toHaveBeenCalledWith(body);
  });

  it("answers 400 when turning on names no provider", async () => {
    const res = await call.autoCharge({ type: "parent_gift", id: ITEM_ID, on: true });
    expect(res.status).toBe(400);
    expect(service.setAutoChargeInApp).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/payments/cards/:provider", () => {
  it("removes the card at that provider", async () => {
    const res = await call.cards("stripe");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { removed: true } });
    expect(service.removeSavedCard).toHaveBeenCalledWith({ provider: "stripe" });
  });

  it("answers 400 for an unknown provider", async () => {
    expect((await call.cards("paypal")).status).toBe(400);
    expect(service.removeSavedCard).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/payments/providers", () => {
  it("asks for no item without a query", async () => {
    service.getInAppProviders.mockResolvedValue({ cards: [], item: null });
    const res = await call.providers();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { cards: [], item: null } });
    expect(service.getInAppProviders).toHaveBeenCalledWith(undefined);
  });

  it("passes the item from a full query", async () => {
    service.getInAppProviders.mockResolvedValue({ cards: [], item: null });
    await call.providers(`?childId=${CHILD_ID}&kind=gift&id=${ITEM_ID}`);
    expect(service.getInAppProviders).toHaveBeenCalledWith({
      childId: CHILD_ID,
      kind: "gift",
      id: ITEM_ID,
    });
  });

  it("answers 400 for part of an item", async () => {
    expect((await call.providers(`?childId=${CHILD_ID}`)).status).toBe(400);
    expect(service.getInAppProviders).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/payments/fake/complete", () => {
  it("completes the fake payment", async () => {
    const body = { mode: "payment", ref: PAYMENT_ID, outcome: "pay" };
    const res = await call.fake(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });
    expect(service.completeFakeInApp).toHaveBeenCalledWith(body);
  });

  it("answers 404 when the service says the fake provider is off", async () => {
    service.completeFakeInApp.mockRejectedValue(new AppError("NOT_FOUND", "Not found"));
    const res = await call.fake({ mode: "payment", ref: PAYMENT_ID, outcome: "pay" });
    expect(res.status).toBe(404);
  });

  it("answers 400 for an outcome of the other mode", async () => {
    const res = await call.fake({ mode: "payment", ref: PAYMENT_ID, outcome: "ok" });
    expect(res.status).toBe(400);
    expect(service.completeFakeInApp).not.toHaveBeenCalled();
  });
});
