// @vitest-environment node
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BEARER_ID = "8b0c2a4e-5f1d-4c3b-9a7e-2d6f8e1b3c5a";
const COOKIE_ID = "3c9e7a1b-2d4f-4e6a-8b0c-9d1e2f3a4b5c";
const TOKEN = "header.payload-secret-token.signature";

const claimsFor = (sub: string) => ({
  sub,
  role: "authenticated",
  aud: "authenticated",
  email: null,
});

const getClaims = vi.fn();
const cookieGetClaims = vi.fn();
const cookies = vi.fn(async () => ({ getAll: () => [], set: () => {} }));

vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@supabase/supabase-js")>()),
  createClient: vi.fn((_url: string, _key: string, options?: { accessToken?: unknown }) =>
    options?.accessToken ? { kind: "scoped" } : { auth: { getClaims } },
  ),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ kind: "cookie", auth: { getClaims: cookieGetClaims } })),
}));
vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => {}),
}));

const { json, withApi } = await import("@/lib/api");
const { getCurrentUser } = await import("@/features/auth/server");
const { createClient } = await import("@/lib/supabase/server");
const { logger } = await import("@/lib");

/** A route that reports who it runs as and which client it got. */
const route = async (_request: Request) => {
  const user = await getCurrentUser();
  const client = (await createClient()) as unknown as { kind: string };
  return json({ userId: user?.id ?? null, client: client.kind });
};
const bearerRoute = withApi(route, { bearer: true });
const cookieRoute = withApi(route);

const call = (handler: (request: Request) => Promise<Response>, authorization?: string) =>
  handler(
    new Request("http://localhost:3000/api/v1/x", {
      method: "POST",
      headers: authorization === undefined ? {} : { authorization },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: claimsFor(BEARER_ID) }, error: null });
  cookieGetClaims.mockResolvedValue({ data: { claims: claimsFor(COOKIE_ID) }, error: null });
});
afterEach(() => vi.restoreAllMocks());

describe("withApi({ bearer: true })", () => {
  it("runs the handler as the bearer's user with the scoped client", async () => {
    const res = await call(bearerRoute, `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { userId: BEARER_ID, client: "scoped" } });
    expect(cookies).not.toHaveBeenCalled();
  });

  it("uses the cookie session when no header is sent", async () => {
    const res = await call(bearerRoute);
    expect(await res.json()).toEqual({ data: { userId: COOKIE_ID, client: "cookie" } });
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("answers a malformed header with JSON 401, never the cookie user", async () => {
    const res = await call(bearerRoute, "Bearer a b");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect(cookies).not.toHaveBeenCalled();
  });

  it("answers a bad token with JSON 401", async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error("invalid JWT") });
    const res = await call(bearerRoute, `Bearer ${TOKEN}`);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect(cookies).not.toHaveBeenCalled();
  });

  it("answers a retryable verify error with JSON 503", async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthRetryableFetchError("x", 0) });
    const res = await call(bearerRoute, `Bearer ${TOKEN}`);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: "UNAVAILABLE" } });
  });

  it("never logs the token", async () => {
    const spies = (["debug", "info", "warn", "error"] as const).map((level) =>
      vi.spyOn(logger, level).mockImplementation(() => {}),
    );
    getClaims.mockResolvedValue({ data: null, error: new Error("invalid JWT") });
    await call(bearerRoute, `Bearer ${TOKEN}`);
    await call(bearerRoute, `Bearer ${TOKEN} extra`);
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain("secret-token");
    }
  });
});

describe("withApi without bearer", () => {
  it("ignores the header and runs as the cookie user", async () => {
    const res = await call(cookieRoute, `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { userId: COOKIE_ID, client: "cookie" } });
    expect(getClaims).not.toHaveBeenCalled();
  });
});
