// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const pingDatabase = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/health", () => ({ pingDatabase }));

const { GET } = await import("./route");

const get = (path: string) => GET(new Request(`http://localhost:3000${path}`));

beforeEach(() => vi.clearAllMocks());

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
    expect(await res.json()).toEqual({ data: { status: "ok", database: "ok" } });
  });

  it("deep=1 answers 503 when the database does not reply", async () => {
    pingDatabase.mockResolvedValue(false);
    const res = await get("/api/health?deep=1");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ data: { status: "degraded", database: "unreachable" } });
  });
});
