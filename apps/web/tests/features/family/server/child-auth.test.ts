import { beforeEach, describe, expect, it, vi } from "vitest";

const generateLink = vi.fn();
const verifyOtp = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { generateLink } } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/stateless", () => ({
  createStatelessClient: () => ({ auth: { verifyOtp } }),
}));

const { mintChildSessionTokens } = await import("@/features/family/server/child-auth");

const session = {
  access_token: "access",
  refresh_token: "refresh",
  expires_at: 1_900_000_000,
  expires_in: 3600,
};

beforeEach(() => {
  vi.clearAllMocks();
  generateLink.mockResolvedValue({ data: { properties: { hashed_token: "hash" } }, error: null });
});

describe("mintChildSessionTokens", () => {
  it("maps the verified session", async () => {
    verifyOtp.mockResolvedValue({ data: { session }, error: null });
    await expect(mintChildSessionTokens("c1")).resolves.toEqual({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: 1_900_000_000,
    });
    expect(verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "hash" });
  });

  it("falls back to now + expires_in when expires_at is missing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    verifyOtp.mockResolvedValue({
      data: { session: { ...session, expires_at: undefined } },
      error: null,
    });
    const tokens = await mintChildSessionTokens("c1");
    vi.useRealTimers();
    expect(tokens.expiresAt).toBe(Math.floor(Date.parse("2030-01-01T00:00:00Z") / 1000) + 3600);
  });

  it("throws INTERNAL when there is no session", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
    await expect(mintChildSessionTokens("c1")).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("throws INTERNAL when the link cannot be generated", async () => {
    generateLink.mockResolvedValue({ data: null, error: { code: "x", status: 500 } });
    await expect(mintChildSessionTokens("c1")).rejects.toMatchObject({ code: "INTERNAL" });
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
