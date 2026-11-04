// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

const CHILD_ID = "8b0c2a4e-5f1d-4c3b-9a7e-2d6f8e1b3c5a";
const PARENT_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const TOKEN = "ExponentPushToken[secret-phone-token_1]";
const ROW_ID = "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a";

const registerDeviceToken = vi.fn();
const unregisterDeviceToken = vi.fn();
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));

vi.mock("@/features/notifications/server", () => ({ registerDeviceToken, unregisterDeviceToken }));
vi.mock("@/lib/supabase/request-scope", () => import("./fake-bearer-scope"));
vi.mock("@/lib", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib")>()),
  logger: log,
}));

const { PHONE_HEADERS, scope } = await import("./fake-bearer-scope");
const { POST, DELETE } = await import("@/app/api/v1/push/tokens/route");

function call(
  handler: typeof POST,
  method: "POST" | "DELETE",
  body: unknown,
  headers: Record<string, string> = PHONE_HEADERS,
) {
  return handler(
    new Request("http://localhost:3000/api/v1/push/tokens", {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

/** As the real services: `assertUser()` reads the bearer scope; nobody signed in is a 401. */
function signedIn(): string {
  const user = scope.user;
  if (!user) throw new AppError("UNAUTHORIZED", "You must be signed in");
  return user.id;
}

let registeredAs: string | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  registeredAs = null;
  scope.entered = 0;
  scope.phoneUser = { id: CHILD_ID, email: null };
  registerDeviceToken.mockImplementation(async () => {
    registeredAs = signedIn();
    return { id: ROW_ID };
  });
  unregisterDeviceToken.mockImplementation(async () => {
    signedIn();
    return { removed: true };
  });
});

describe("POST /api/v1/push/tokens", () => {
  it("POST with a child bearer registers and returns 201 { data: { id } }", async () => {
    const res = await call(POST, "POST", { token: TOKEN, platform: "android" });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ data: { id: ROW_ID } });
    expect(registerDeviceToken).toHaveBeenCalledWith({ token: TOKEN, platform: "android" });
    expect(registeredAs).toBe(CHILD_ID);
  });

  it("POST with a parent bearer registers", async () => {
    scope.phoneUser = { id: PARENT_ID, email: "parent@example.test" };
    const res = await call(POST, "POST", { token: TOKEN, platform: "android" });
    expect(res.status).toBe(201);
    expect(registeredAs).toBe(PARENT_ID);
  });

  it("POST with a bad token is 400 and never calls the RPC", async () => {
    for (const body of [
      { token: "abc", platform: "android" },
      { token: TOKEN, platform: "ios" },
      { token: TOKEN },
    ]) {
      const res = await call(POST, "POST", body);
      expect(res.status).toBe(400);
    }
    expect(registerDeviceToken).not.toHaveBeenCalled();
  });

  it("POST without a bearer or cookie is 401", async () => {
    const res = await call(POST, "POST", { token: TOKEN, platform: "android" }, {});
    expect(res.status).toBe(401);
    expect(registeredAs).toBeNull();
    const stale = await call(
      POST,
      "POST",
      { token: TOKEN, platform: "android" },
      { authorization: "Bearer stale" },
    );
    expect(stale.status).toBe(401);
  });

  it("RPC 42501 (not a member) is 403 with a safe message", async () => {
    registerDeviceToken.mockRejectedValue(new AppError("FORBIDDEN", "Join a family first."));
    const res = await call(POST, "POST", { token: TOKEN, platform: "android" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      error: { code: "FORBIDDEN", message: "Join a family first." },
    });
  });
});

describe("DELETE /api/v1/push/tokens", () => {
  it("DELETE returns { removed }", async () => {
    const res = await call(DELETE, "DELETE", { token: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { removed: true } });
    expect(unregisterDeviceToken).toHaveBeenCalledWith(TOKEN);

    unregisterDeviceToken.mockResolvedValue({ removed: false });
    const again = await call(DELETE, "DELETE", { token: TOKEN });
    expect(await again.json()).toEqual({ data: { removed: false } });
  });

  it("DELETE with a bad token is 400 and without a bearer is 401", async () => {
    expect((await call(DELETE, "DELETE", { token: "nope" })).status).toBe(400);
    expect((await call(DELETE, "DELETE", { token: TOKEN }, {})).status).toBe(401);
  });
});

describe("logging", () => {
  it("the token never appears in logs", async () => {
    await call(POST, "POST", { token: TOKEN, platform: "android" });
    await call(POST, "POST", { token: TOKEN, platform: "ios" });
    registerDeviceToken.mockRejectedValue(
      new AppError("INTERNAL", "Something went wrong. Please try again.", {
        cause: new Error("db failed"),
      }),
    );
    await call(POST, "POST", { token: TOKEN, platform: "android" });
    await call(DELETE, "DELETE", { token: TOKEN });
    const logged = JSON.stringify([
      ...log.info.mock.calls,
      ...log.warn.mock.calls,
      ...log.error.mock.calls,
      ...log.debug.mock.calls,
    ]);
    expect(logged).not.toContain("secret-phone-token");
  });
});
