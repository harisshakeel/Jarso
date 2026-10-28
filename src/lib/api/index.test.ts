// @vitest-environment node
import { describe, expect, it } from "vitest";
import { json, withApi } from "./index";

const handler = withApi(async () => json({ ok: true }));
const call = (method: string, headers: Record<string, string> = {}) =>
  handler(new Request("http://localhost:3000/api/v1/me", { method, headers }));

describe("withApi CSRF guard", () => {
  it("allows safe methods from anywhere", async () => {
    const res = await call("GET", { origin: "https://evil.example" });
    expect(res.status).toBe(200);
  });

  it("allows mutations from the app origin", async () => {
    const res = await call("PATCH", { origin: "http://localhost:3000" });
    expect(res.status).toBe(200);
  });

  it("allows mutations whose origin matches the host header", async () => {
    const res = await call("PATCH", {
      origin: "https://preview.example.app",
      host: "preview.example.app",
    });
    expect(res.status).toBe(200);
  });

  it("allows mutations without an origin header", async () => {
    const res = await call("PATCH");
    expect(res.status).toBe(200);
  });

  it("rejects cross-origin mutations with 403", async () => {
    const res = await call("PATCH", { origin: "https://evil.example", host: "localhost:3000" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });
});
