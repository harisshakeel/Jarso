// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  server: { CRON_SECRET: "cron-placeholder-secret-value" as string | undefined },
}));
const drainPush = vi.hoisted(() => vi.fn());

vi.mock("@/config/env.server", () => ({ serverEnv: env.server }));
vi.mock("@/features/notifications/server", () => ({ drainPush }));

const { GET, POST } = await import("@/app/api/cron/push/route");

function get(authorization?: string) {
  return GET(
    new Request("http://localhost:3000/api/cron/push", {
      headers: authorization ? { authorization } : {},
    }),
  );
}

function post(authorization?: string) {
  return POST(
    new Request("http://localhost:3000/api/cron/push", {
      method: "POST",
      headers: authorization ? { authorization } : {},
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  env.server.CRON_SECRET = "cron-placeholder-secret-value";
  drainPush.mockResolvedValue({ claimed: 2, sent: 1, dropped: 1, failed: 0 });
});

describe("GET /api/cron/push", () => {
  it("does not exist without a cron secret", async () => {
    env.server.CRON_SECRET = undefined;
    const res = await get("Bearer cron-placeholder-secret-value");
    expect(res.status).toBe(404);
    expect(drainPush).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong bearer token", async () => {
    expect((await get()).status).toBe(401);
    expect((await get("Bearer cron-placeholder-secret-valu")).status).toBe(401);
    expect((await get("Bearer cron-placeholder-secret-value!")).status).toBe(401);
    expect(drainPush).not.toHaveBeenCalled();
  });

  it("dispatches with the right token and reports the counts", async () => {
    const res = await get("Bearer cron-placeholder-secret-value");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { claimed: 2, sent: 1, dropped: 1, failed: 0 } });
    expect(drainPush).toHaveBeenCalledWith(15_000);
  });
});

// pg_cron calls the sweep through pg_net every 15 minutes with a POST.
describe("POST /api/cron/push", () => {
  it("POST with the secret drains", async () => {
    const res = await post("Bearer cron-placeholder-secret-value");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { claimed: 2, sent: 1, dropped: 1, failed: 0 } });
    expect(drainPush).toHaveBeenCalledWith(15_000);
  });

  it("POST with a wrong secret is 401", async () => {
    expect((await post("Bearer cron-placeholder-secret-valu")).status).toBe(401);
    expect((await post()).status).toBe(401);
    expect(drainPush).not.toHaveBeenCalled();
  });
});
