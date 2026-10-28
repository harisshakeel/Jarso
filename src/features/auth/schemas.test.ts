import { describe, expect, it } from "vitest";
import { safeNextPath, signUpSchema } from "./schemas";

describe("safeNextPath", () => {
  it.each([
    ["/settings", "/settings"],
    [null, "/dashboard"],
    ["https://evil.com", "/dashboard"],
    ["//evil.com", "/dashboard"],
    ["/\\evil.com", "/dashboard"],
    ["/invite?token=abc123", "/invite?token=abc123"],
    ["/parent/setup?next=%2Finvite%3Ftoken%3Dabc", "/parent/setup?next=%2Finvite%3Ftoken%3Dabc"],
    ["//evil.com/invite?token=abc", "/dashboard"],
    ["https://evil.com/?next=/invite", "/dashboard"],
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
