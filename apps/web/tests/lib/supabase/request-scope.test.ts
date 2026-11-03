// @vitest-environment node
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BEARER_ID = "8b0c2a4e-5f1d-4c3b-9a7e-2d6f8e1b3c5a";
const OTHER_ID = "1f2e3d4c-5b6a-4987-8a6b-5c4d3e2f1a0b";
const COOKIE_ID = "3c9e7a1b-2d4f-4e6a-8b0c-9d1e2f3a4b5c";
const TOKEN = "header.payload-secret-token.signature";

const claimsFor = (sub: string, extra: Record<string, unknown> = {}) => ({
  sub,
  role: "authenticated",
  aud: "authenticated",
  email: "kid@example.test",
  ...extra,
});

/** Verifies a token: each test maps tokens to what `getClaims` resolves with. */
const getClaims = vi.fn();
const cookieGetClaims = vi.fn();
const cookies = vi.fn(async () => ({ getAll: () => [], set: () => {} }));

vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@supabase/supabase-js")>()),
  // The stateless verifier has no `accessToken`; the scoped client does.
  createClient: vi.fn((_url: string, _key: string, options?: { accessToken?: unknown }) =>
    options?.accessToken ? { kind: "scoped", options } : { auth: { getClaims } },
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

const supabaseJs = await import("@supabase/supabase-js");
const ssr = await import("@supabase/ssr");
const { currentScope, runInBearerScope, verifyBearer } = await import(
  "@/lib/supabase/request-scope"
);
const { createClient } = await import("@/lib/supabase/server");
const { assertRequestUser, getCurrentUser } = await import("@/features/auth/server");
const { logger } = await import("@/lib");

const req = (authorization?: string) =>
  new Request("http://localhost/api/v1/x", {
    headers: authorization === undefined ? {} : { authorization },
  });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const logSpies = () =>
  (["debug", "info", "warn", "error"] as const).map((level) =>
    vi.spyOn(logger, level).mockImplementation(() => {}),
  );

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockImplementation(async (token: string) => ({
    data: { claims: claimsFor(token === "other-token" ? OTHER_ID : BEARER_ID) },
    error: null,
  }));
  cookieGetClaims.mockResolvedValue({ data: { claims: claimsFor(COOKIE_ID) }, error: null });
});
afterEach(() => vi.restoreAllMocks());

describe("runInBearerScope", () => {
  it("with no header runs unscoped, so createClient uses cookies", async () => {
    const client = await runInBearerScope(req(), async () => {
      expect(currentScope()).toBeUndefined();
      return createClient();
    });
    expect(client).toMatchObject({ kind: "cookie" });
    expect(cookies).toHaveBeenCalled();
    expect(ssr.createServerClient).toHaveBeenCalled();
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("with a valid bearer gives the token's user and a scoped client, never cookies", async () => {
    await runInBearerScope(req(`Bearer ${TOKEN}`), async () => {
      const user = await getCurrentUser();
      expect(user).toEqual({ id: BEARER_ID, email: "kid@example.test" });
      expect(user).not.toHaveProperty("token");
      const client = (await createClient()) as unknown as {
        kind: string;
        options: {
          accessToken: () => Promise<string>;
          auth: Record<string, boolean>;
          db: { retry: boolean };
          global: { fetch: unknown; headers?: unknown };
        };
      };
      expect(client.kind).toBe("scoped");
      await expect(client.options.accessToken()).resolves.toBe(TOKEN);
      expect(client.options.auth).toEqual({
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      });
      expect(client.options.db).toEqual({ retry: false });
      expect(client.options.global.fetch).toEqual(expect.any(Function));
      expect(client.options.global.headers).toBeUndefined();
      expect(currentScope()?.client).toBe(client);
    });
    expect(getClaims).toHaveBeenCalledWith(TOKEN);
    expect(cookies).not.toHaveBeenCalled();
    expect(cookieGetClaims).not.toHaveBeenCalled();
  });

  it("lets the bearer win over a different cookie user", async () => {
    const id = await runInBearerScope(req(`Bearer ${TOKEN}`), async () => {
      return (await getCurrentUser())?.id;
    });
    expect(id).toBe(BEARER_ID);
    expect(cookies).not.toHaveBeenCalled();
  });

  it.each(["", "Basic x", "Bearer", "Bearer a b"])(
    "rejects header %j with 401 and never reads cookies",
    async (header) => {
      const fn = vi.fn(async () => getCurrentUser());
      await expect(runInBearerScope(req(header), fn)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      expect(fn).not.toHaveBeenCalled();
      expect(getClaims).not.toHaveBeenCalled();
      expect(cookies).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["role is not authenticated", claimsFor(BEARER_ID, { role: "anon" })],
    ["role is missing", { ...claimsFor(BEARER_ID), role: undefined }],
    ["sub is missing", { ...claimsFor(BEARER_ID), sub: undefined }],
    ["sub is not a UUID", claimsFor("u1")],
    ["aud is another audience", claimsFor(BEARER_ID, { aud: "other" })],
    ["aud list lacks authenticated", claimsFor(BEARER_ID, { aud: ["other"] })],
    ["the user is anonymous", claimsFor(BEARER_ID, { is_anonymous: true })],
  ])("rejects a token whose %s with 401, never reading cookies", async (_name, claims) => {
    getClaims.mockResolvedValue({ data: { claims }, error: null });
    const fn = vi.fn(async () => {});
    await expect(runInBearerScope(req(`Bearer ${TOKEN}`), fn)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(fn).not.toHaveBeenCalled();
    expect(cookies).not.toHaveBeenCalled();
  });

  it("accepts an aud list that contains authenticated", async () => {
    getClaims.mockResolvedValue({
      data: { claims: claimsFor(BEARER_ID, { aud: ["authenticated", "other"] }) },
      error: null,
    });
    await expect(verifyBearer(`Bearer ${TOKEN}`)).resolves.toMatchObject({ id: BEARER_ID });
  });

  it("rejects a token getClaims refuses with 401", async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error("invalid JWT") });
    await expect(runInBearerScope(req(`Bearer ${TOKEN}`), async () => {})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(cookies).not.toHaveBeenCalled();
  });

  it("turns a retryable verify error into UNAVAILABLE", async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthRetryableFetchError("x", 0) });
    await expect(runInBearerScope(req(`Bearer ${TOKEN}`), async () => {})).rejects.toMatchObject({
      code: "UNAVAILABLE",
      message: "Jarso is taking a while. Please try again.",
    });
  });

  it("leaves no scope behind once it resolves or rejects", async () => {
    await runInBearerScope(req(`Bearer ${TOKEN}`), async () => {
      expect(currentScope()?.user.id).toBe(BEARER_ID);
    });
    expect(currentScope()).toBeUndefined();
    await expect(
      runInBearerScope(req(`Bearer ${TOKEN}`), async () => {
        throw new Error("handler failed");
      }),
    ).rejects.toThrow("handler failed");
    expect(currentScope()).toBeUndefined();
  });

  it("keeps concurrent scopes isolated", async () => {
    const seen = await Promise.all([
      runInBearerScope(req(`Bearer ${TOKEN}`), async () => {
        await wait(20);
        const first = (await getCurrentUser())?.id;
        await wait(5);
        return [first, (await getCurrentUser())?.id, currentScope()?.user.id];
      }),
      runInBearerScope(req("Bearer other-token"), async () => {
        await wait(5);
        const first = (await getCurrentUser())?.id;
        await wait(20);
        return [first, (await getCurrentUser())?.id, currentScope()?.user.id];
      }),
      runInBearerScope(req(), async () => {
        await wait(10);
        return [(await getCurrentUser())?.id];
      }),
    ]);
    expect(seen).toEqual([
      [BEARER_ID, BEARER_ID, BEARER_ID],
      [OTHER_ID, OTHER_ID, OTHER_ID],
      [COOKIE_ID],
    ]);
  });

  it("keeps the scope in a stream whose start() runs on after the handler returned", async () => {
    const stream = await runInBearerScope(
      req(`Bearer ${TOKEN}`),
      async () =>
        new ReadableStream<string>({
          async start(controller) {
            await wait(10);
            controller.enqueue((await getCurrentUser())?.id ?? "none");
            controller.close();
          },
        }),
    );
    expect(currentScope()).toBeUndefined();
    const { value } = await stream.getReader().read();
    expect(value).toBe(BEARER_ID);
  });
});

describe("assertRequestUser", () => {
  it("returns only id and email for a bearer", async () => {
    const user = await assertRequestUser(req(`Bearer ${TOKEN}`));
    expect(user).toEqual({ id: BEARER_ID, email: "kid@example.test" });
    expect(Object.keys(user).sort()).toEqual(["email", "id"]);
    expect(cookies).not.toHaveBeenCalled();
  });

  it("uses the cookie session with no header", async () => {
    await expect(assertRequestUser(req())).resolves.toMatchObject({ id: COOKIE_ID });
    expect(getClaims).not.toHaveBeenCalled();
  });
});

describe("token hygiene", () => {
  it("never logs the token or puts it in an error on any failure path", async () => {
    const spies = logSpies();
    const errors: unknown[] = [];
    const attempt = async (header: string) => {
      await runInBearerScope(req(header), async () => {}).catch((e: unknown) => errors.push(e));
      await assertRequestUser(req(header)).catch((e: unknown) => errors.push(e));
    };

    await attempt(`Bearer ${TOKEN} extra`);
    await attempt(`Basic ${TOKEN}`);
    getClaims.mockResolvedValue({ data: null, error: new Error("invalid JWT") });
    await attempt(`Bearer ${TOKEN}`);
    getClaims.mockResolvedValue({ data: null, error: new AuthRetryableFetchError("x", 0) });
    await attempt(`Bearer ${TOKEN}`);
    getClaims.mockResolvedValue({ data: { claims: claimsFor("u1") }, error: null });
    await attempt(`Bearer ${TOKEN}`);

    expect(errors).toHaveLength(10);
    for (const error of errors) {
      const { cause, ...rest } = error as { cause?: unknown };
      expect(JSON.stringify(rest)).not.toContain("secret-token");
      expect(String(error)).not.toContain("secret-token");
      expect(cause === undefined || !String(cause).includes("secret-token")).toBe(true);
    }
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain("secret-token");
    }
  });

  it("verifyBearer keeps the token only on its own result, for the scoped client", async () => {
    const verified = await verifyBearer(`Bearer ${TOKEN}`);
    expect(verified).toEqual({ id: BEARER_ID, email: "kid@example.test", token: TOKEN });
    expect(supabaseJs.createClient).toHaveBeenCalledTimes(1);
  });
});
