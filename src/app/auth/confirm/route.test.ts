// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtpMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { verifyOtp: verifyOtpMock } })),
}));

const { GET } = await import("./route");

const APP = "http://localhost:3000";
const FAILED = "/login?error=auth_confirm";

/** The link the email template builds: `next` is `{{ .RedirectTo | urlquery }}`. */
function confirmUrl(params: Record<string, string>): string {
  return `${APP}/auth/confirm?${new URLSearchParams(params)}`;
}

async function visit(url: string): Promise<string> {
  const response = await GET(new NextRequest(url));
  expect(response.status).toBe(307);
  const location = new URL(response.headers.get("location") ?? "");
  expect(location.origin).toBe(APP);
  return location.pathname + location.search;
}

const callbackRedirect = (next: string) => `${APP}/auth/callback?next=${encodeURIComponent(next)}`;

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    verifyOtpMock.mockReset();
    verifyOtpMock.mockResolvedValue({ data: {}, error: null });
  });

  it("verifies the token hash and redirects to the wrapped next", async () => {
    const url = confirmUrl({
      token_hash: "hash",
      type: "email",
      next: callbackRedirect("/invite?token=abc"),
    });

    expect(await visit(url)).toBe("/invite?token=abc");
    expect(verifyOtpMock).toHaveBeenCalledWith({ type: "email", token_hash: "hash" });
  });

  it("accepts a same-origin URL or a relative path as next", async () => {
    expect(
      await visit(confirmUrl({ token_hash: "h", type: "signup", next: `${APP}/parent` })),
    ).toBe("/parent");
    expect(await visit(confirmUrl({ token_hash: "h", type: "email", next: "/parent/setup" }))).toBe(
      "/parent/setup",
    );
  });

  it("falls back to the dashboard without next", async () => {
    expect(await visit(confirmUrl({ token_hash: "h", type: "email" }))).toBe("/dashboard");
  });

  it.each([
    "https://evil.com/parent",
    "//evil.com/parent",
    "/\\evil.com",
    callbackRedirect("//evil.com"),
    `https://evil.com/auth/callback?next=${encodeURIComponent("/parent")}`,
    "javascript:alert(1)",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    " /evil",
    `${APP}/auth/callback?next=%2F%09%2Fevil.com`,
    `${APP}/auth/callback?next=%2F%0A%2Fevil.com`,
    `${APP}/auth/callback?next=%2F%0D%2Fevil.com`,
  ])("replaces unsafe next %s with the dashboard", async (next) => {
    expect(await visit(confirmUrl({ token_hash: "h", type: "email", next }))).toBe("/dashboard");
  });

  it.each<Record<string, string>>([
    { type: "email" },
    { token_hash: "", type: "email" },
    { token_hash: "h" },
    { token_hash: "h", type: "recovery" },
    { token_hash: "h", type: "nonsense" },
  ])("sends a malformed link %o to login without verifying", async (params) => {
    expect(await visit(confirmUrl(params))).toBe(FAILED);
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it("sends an expired or used link to login", async () => {
    verifyOtpMock.mockResolvedValue({
      data: {},
      error: { code: "otp_expired", status: 403, message: "Token has expired or is invalid" },
    });

    expect(await visit(confirmUrl({ token_hash: "h", type: "email", next: "/parent" }))).toBe(
      FAILED,
    );
  });
});
