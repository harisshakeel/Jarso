import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getClaims } })),
}));
vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
// React's per-request cache would memoise across tests; run the function every time.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

const { getCurrentUser } = await import("./session");

describe("getCurrentUser", () => {
  beforeEach(() => getClaims.mockReset());

  it("throws UNAVAILABLE on a retryable auth error", async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthRetryableFetchError("x", 0) });
    await expect(getCurrentUser()).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it("returns null when signed out", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("returns the user from verified claims", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "u1", email: "a@b.co" } },
      error: null,
    });
    await expect(getCurrentUser()).resolves.toEqual({ id: "u1", email: "a@b.co" });
  });
});
