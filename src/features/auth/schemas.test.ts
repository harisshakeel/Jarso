import { describe, expect, it } from "vitest";
import { safeNextPath, signUpSchema } from "./schemas";

describe("safeNextPath", () => {
  it.each([
    ["/settings", "/settings"],
    [null, "/dashboard"],
    ["https://evil.com", "/dashboard"],
    ["//evil.com", "/dashboard"],
    ["/\\evil.com", "/dashboard"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("signUpSchema", () => {
  it("rejects short passwords", () => {
    const result = signUpSchema.safeParse({ email: "a@b.co", password: "short", fullName: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects the synthetic child email domain", () => {
    const result = signUpSchema.safeParse({
      email: "x@child.jarso.invalid",
      password: "long enough",
      fullName: "A",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a normal email", () => {
    const result = signUpSchema.safeParse({
      email: "parent@example.com",
      password: "long enough",
      fullName: "A",
    });
    expect(result.success).toBe(true);
  });
});
