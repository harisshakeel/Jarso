// @vitest-environment node
import { describe, expect, it } from "vitest";
import { json, withApi } from "@/lib/api/index";

const handler = withApi(async (_request: Request) => json({ ok: true }));
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

describe("withApi cross-origin opt-out", () => {
  const open = withApi(async (_request: Request) => json({ ok: true }), { crossOrigin: true });
  const post = (origin: string) =>
    open(new Request("http://localhost:3000/api/v1/x", { method: "POST", headers: { origin } }));

  it("lets another site post when the route opts out (it reads no cookies, changes nothing)", async () => {
    expect((await post("https://api.razorpay.com")).status).toBe(200);
    expect((await post("null")).status).toBe(200);
  });
});
