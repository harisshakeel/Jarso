// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const pingDatabase = vi.hoisted(() => vi.fn());
const isGuideConfigured = vi.hoisted(() => vi.fn(() => false));
vi.mock("@/lib/supabase/health", () => ({ pingDatabase }));
vi.mock("@/features/guide/server", () => ({ isGuideConfigured }));

const { GET } = await import("@/app/api/health/route");

const get = (path: string) => GET(new Request(`http://localhost:3000${path}`));

beforeEach(() => {
  vi.clearAllMocks();
  isGuideConfigured.mockReturnValue(false);
});

describe("GET /api/health", () => {
  it("answers without touching the database", async () => {
    const res = await get("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { status: "ok" } });
    expect(pingDatabase).not.toHaveBeenCalled();
  });

  it("deep=1 reports a reachable database", async () => {
    pingDatabase.mockResolvedValue(true);
    const res = await get("/api/health?deep=1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { status: "ok", database: "ok", guide: "off" } });
  });

  it("deep=1 says when the guide is on for this deployment", async () => {
    pingDatabase.mockResolvedValue(true);
    isGuideConfigured.mockReturnValue(true);
    const res = await get("/api/health?deep=1");
    expect((await res.json()).data.guide).toBe("on");
  });

  it("deep=1 answers 503 when the database does not reply", async () => {
    pingDatabase.mockResolvedValue(false);
    const res = await get("/api/health?deep=1");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      data: { status: "degraded", database: "unreachable", guide: "off" },
    });
  });
});
