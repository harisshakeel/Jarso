import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signUpMock = vi.fn();
const signOutMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signUp: signUpMock, signOut: signOutMock } })),
}));

const warnMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/logger")>();
  return { ...mod, logger: { ...mod.logger, warn: warnMock } };
});

class Redirect extends Error {
  constructor(readonly url: string) {
    super("NEXT_REDIRECT");
  }
}
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Redirect(url);
  }),
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Redirect) throw error;
  },
}));

const { signOut, signUp } = await import("./actions");

const input = { email: "parent@example.com", password: "long enough", fullName: "Pat" };

function emailRedirectTo(): URL {
  return new URL(signUpMock.mock.calls[0]?.[0].options.emailRedirectTo);
}

describe("signUp", () => {
  beforeEach(() => {
    signUpMock.mockReset();
  });

  it("carries a safe next through the confirmation email", async () => {
    signUpMock.mockResolvedValue({ data: { session: null }, error: null });

    const result = await signUp(null, { ...input, next: "/invite?token=abc" });

    expect(result).toEqual({ ok: true, data: { needsConfirmation: true } });
    const url = emailRedirectTo();
    expect(url.origin + url.pathname).toBe("http://localhost:3000/auth/callback");
    expect(url.searchParams.get("next")).toBe("/invite?token=abc");
  });

  it("replaces an unsafe next with the dashboard", async () => {
    signUpMock.mockResolvedValue({ data: { session: null }, error: null });

    await signUp(null, { ...input, next: "//evil.com" });

    expect(emailRedirectTo().searchParams.get("next")).toBe("/dashboard");
  });

  it("redirects to next when sign-up returns a session", async () => {
    signUpMock.mockResolvedValue({ data: { session: {} }, error: null });

    await expect(signUp(null, { ...input, next: "/invite?token=abc" })).rejects.toMatchObject({
      url: "/invite?token=abc",
    });
  });

  it("redirects to the dashboard without next", async () => {
    signUpMock.mockResolvedValue({ data: { session: {} }, error: null });

    await expect(signUp(null, input)).rejects.toMatchObject({ url: "/dashboard" });
  });
});

describe("signOut", () => {
  beforeEach(() => {
    signOutMock.mockReset();
    warnMock.mockReset();
  });

  it("logs and still redirects when the revoke call errors", async () => {
    signOutMock.mockResolvedValue({ error: new AuthRetryableFetchError("x", 0) });

    await expect(signOut(null, {})).rejects.toMatchObject({ url: "/login" });

    expect(warnMock).toHaveBeenCalledWith("Sign-out revoke failed", {
      code: undefined,
    });
  });

  it("redirects without logging when the revoke call succeeds", async () => {
    signOutMock.mockResolvedValue({ error: null });

    await expect(signOut(null, {})).rejects.toMatchObject({ url: "/login" });

    expect(warnMock).not.toHaveBeenCalled();
  });
});
