// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { exchangeCodeForSession: exchangeMock } })),
}));

const { GET } = await import("./route");

const APP = "http://localhost:3000";

async function visit(query: string): Promise<string> {
  const response = await GET(new NextRequest(`${APP}/auth/callback?${query}`));
  expect(response.status).toBe(307);
  const location = new URL(response.headers.get("location") ?? "");
  expect(location.origin).toBe(APP);
  return location.pathname + location.search;
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeMock.mockReset();
    exchangeMock.mockResolvedValue({ data: {}, error: null });
  });

  it("exchanges the code and redirects to a safe next", async () => {
    expect(await visit(`code=c&next=${encodeURIComponent("/invite?token=abc")}`)).toBe(
      "/invite?token=abc",
    );
    expect(exchangeMock).toHaveBeenCalledWith("c");
  });

  it.each(["%2F%09%2Fevil.com", "%2F%0A%2Fevil.com", "%2F%0D%2Fevil.com", "%2F%2Fevil.com"])(
    "replaces unsafe next %s with the dashboard",
    async (next) => {
      expect(await visit(`code=c&next=${next}`)).toBe("/dashboard");
    },
  );

  it("sends a failed exchange to login", async () => {
    exchangeMock.mockResolvedValue({ data: {}, error: { code: "bad_code", status: 400 } });
    expect(await visit("code=c&next=%2Fparent")).toBe("/login?error=auth_callback");
  });

  it("sends a missing code to login", async () => {
    expect(await visit("next=%2Fparent")).toBe("/login?error=auth_callback");
    expect(exchangeMock).not.toHaveBeenCalled();
  });
});
