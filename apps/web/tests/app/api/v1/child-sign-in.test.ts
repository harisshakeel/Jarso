import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

vi.mock("@/features/family/server", () => ({
  childSignInForTokens: vi.fn(),
  getClientIp: vi.fn(async () => "1.2.3.4"),
}));

const family = await import("@/features/family/server");
const { POST } = await import("@/app/api/v1/auth/child-sign-in/route");

const body = { familyCode: "ABCD-2345", nickname: "Sam", pin: "4827" };
const post = (payload: unknown) =>
  POST(
    new Request("http://localhost/api/v1/auth/child-sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );

beforeEach(() => vi.clearAllMocks());

describe("POST /api/v1/auth/child-sign-in", () => {
  it("returns only the three token fields", async () => {
    const tokens = { accessToken: "a", refreshToken: "r", expiresAt: 123 };
    vi.mocked(family.childSignInForTokens).mockResolvedValue(tokens);
    const res = await post(body);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ data: tokens });
    expect(text).not.toContain(body.pin);
    expect(family.childSignInForTokens).toHaveBeenCalledWith(expect.anything(), "1.2.3.4");
  });

  it("400s on a bad body", async () => {
    const res = await post({ familyCode: "x" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION");
    expect(family.childSignInForTokens).not.toHaveBeenCalled();
  });

  it("401s on a wrong PIN with the web wording", async () => {
    vi.mocked(family.childSignInForTokens).mockRejectedValue(
      new AppError("UNAUTHORIZED", "Hmm, that didn't match. Check with your parent."),
    );
    const res = await post(body);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.message).toBe("Hmm, that didn't match. Check with your parent.");
    expect(JSON.stringify(json)).not.toContain(body.pin);
  });

  it("429s when locked", async () => {
    vi.mocked(family.childSignInForTokens).mockRejectedValue(
      new AppError("RATE_LIMITED", "Too many tries. Ask your parent or wait a little while."),
    );
    const res = await post(body);
    expect(res.status).toBe(429);
    expect((await res.json()).error.message).toBe(
      "Too many tries. Ask your parent or wait a little while.",
    );
  });
});
