import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "8b0c2a4e-5f1d-4c3b-9a7e-2d6f8e1b3c5a";
const getClaims = vi.fn();
const assertUser = vi.fn();
vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@supabase/supabase-js")>()),
  createClient: vi.fn(() => ({ auth: { getClaims } })),
}));
vi.mock("@/features/auth/server/session", () => ({ assertUser }));
vi.mock("@/config/env.client", () => ({
  clientEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-placeholder",
  },
}));

const { assertRequestUser } = await import("@/features/auth/server/request-user");

const req = (authorization?: string) =>
  new Request("http://localhost/api/v1/x", {
    headers: authorization ? { authorization } : {},
  });

describe("assertRequestUser", () => {
  beforeEach(() => {
    getClaims.mockReset();
    assertUser.mockReset();
  });

  it("returns the user for a valid bearer token", async () => {
    // Real access-token claims: a signed-in (authenticated) user with a UUID subject.
    getClaims.mockResolvedValue({
      data: {
        claims: { sub: USER_ID, role: "authenticated", aud: "authenticated", email: "a@b.co" },
      },
      error: null,
    });
    await expect(assertRequestUser(req("Bearer tok"))).resolves.toEqual({
      id: USER_ID,
      email: "a@b.co",
    });
    expect(getClaims).toHaveBeenCalledWith("tok");
    expect(assertUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer without falling back to cookies", async () => {
    assertUser.mockResolvedValue({ id: "cookie-user", email: null });
    getClaims.mockResolvedValue({ data: null, error: new Error("bad jwt") });
    await expect(assertRequestUser(req("Bearer bad"))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(assertUser).not.toHaveBeenCalled();
  });

  it("delegates to assertUser with no header", async () => {
    assertUser.mockResolvedValue({ id: "c1", email: null });
    await expect(assertRequestUser(req())).resolves.toEqual({ id: "c1", email: null });
  });

  it("rejects a header that is not Bearer", async () => {
    assertUser.mockResolvedValue({ id: "cookie-user", email: null });
    await expect(assertRequestUser(req("Basic abc"))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(assertRequestUser(req("Bearer"))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("throws UNAVAILABLE on a retryable error", async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthRetryableFetchError("x", 0) });
    await expect(assertRequestUser(req("Bearer tok"))).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });
});
