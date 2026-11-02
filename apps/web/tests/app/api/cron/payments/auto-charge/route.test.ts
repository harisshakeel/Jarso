// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "test-cron-secret-0123456789";

const state = vi.hoisted(() => ({
  env: { CRON_SECRET: undefined as string | undefined },
  enabled: true,
}));

vi.mock("@/config/env.server", () => ({ serverEnv: state.env }));
vi.mock("@/lib/payments", () => ({ paymentsEnabled: () => state.enabled }));
vi.mock("@/features/payments/server", () => ({ runAutoCharges: vi.fn() }));

const payments = await import("@/features/payments/server");
const { GET, POST } = await import("@/app/api/cron/payments/auto-charge/route");

const COUNTS = { attempted: 2, succeeded: 1, failed: 1, skipped: 0 };
const URL_ = "http://localhost:3000/api/cron/payments/auto-charge";

const call = (handler: typeof GET, method: string, authorization?: string) =>
  handler(
    new Request(URL_, {
      method,
      headers: authorization ? { authorization } : {},
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  state.env.CRON_SECRET = SECRET;
  state.enabled = true;
  vi.mocked(payments.runAutoCharges).mockResolvedValue(COUNTS);
});

describe("cron auto charge route", () => {
  it("is not found without CRON_SECRET", async () => {
    state.env.CRON_SECRET = undefined;
    const res = await call(GET, "GET", `Bearer ${SECRET}`);
    expect(res.status).toBe(404);
    expect(payments.runAutoCharges).not.toHaveBeenCalled();
  });

  it("is not found with payments off", async () => {
    state.enabled = false;
    const res = await call(GET, "GET", `Bearer ${SECRET}`);
    expect(res.status).toBe(404);
    expect(payments.runAutoCharges).not.toHaveBeenCalled();
  });

  it("refuses a wrong or missing bearer", async () => {
    expect((await call(GET, "GET", "Bearer wrong")).status).toBe(401);
    expect((await call(POST, "POST", `Bearer ${SECRET}x`)).status).toBe(401);
    expect((await call(GET, "GET")).status).toBe(401);
    // Same length as the real header, so only the constant-time compare rejects it.
    const sameLength = `Bearer ${"x".repeat(SECRET.length)}`;
    expect((await call(POST, "POST", sameLength)).status).toBe(401);
    expect(payments.runAutoCharges).not.toHaveBeenCalled();
  });

  it("runs the job with the right bearer on GET (Vercel Cron) and POST (pg_net)", async () => {
    for (const [handler, method] of [
      [GET, "GET"],
      [POST, "POST"],
    ] as const) {
      const res = await call(handler, method, `Bearer ${SECRET}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ data: COUNTS });
    }
    expect(payments.runAutoCharges).toHaveBeenCalledTimes(2);
  });
});
