import { describe, expect, it } from "vitest";
import { safeNextPath, signInSchema, signUpSchema, withNext } from "./schemas";

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
    // Browsers and the URL parser strip tabs and newlines, so "/\t/evil.com" becomes "//evil.com".
    ["/\t/evil.com", "/dashboard"],
    ["/\n/evil.com", "/dashboard"],
    ["/\r/evil.com", "/dashboard"],
    ["/\u0000/evil.com", "/dashboard"],
    ["/\u007f/evil.com", "/dashboard"],
    [" /evil", "/dashboard"],
    ["/parent /x", "/dashboard"],
    ["/parent", "/parent"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("withNext", () => {
  it("appends a safe next, encoded", () => {
    expect(withNext("/signup", "/invite?token=abc")).toBe("/signup?next=%2Finvite%3Ftoken%3Dabc");
  });

  it.each([undefined, null, "", "//evil.com", "https://evil.com"])("drops %s", (next) => {
    expect(withNext("/signup", next)).toBe("/signup");
  });
});

describe("signUpSchema", () => {
  const valid = { email: "parent@example.com", password: "long enough", fullName: "A" };

  it("keeps an optional next", () => {
    expect(signUpSchema.parse({ ...valid, next: "/invite?token=abc" }).next).toBe(
      "/invite?token=abc",
    );
    expect(signUpSchema.parse(valid).next).toBeUndefined();
  });

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

describe("signInSchema", () => {
  it.each(["x@child.jarso.invalid", "X@CHILD.Jarso.Invalid"])(
    "rejects child account %s",
    (email) => {
      expect(signInSchema.safeParse({ email, password: "anything" }).success).toBe(false);
    },
  );

  it("accepts a parent email", () => {
    expect(signInSchema.safeParse({ email: "parent@example.com", password: "x" }).success).toBe(
      true,
    );
  });
});
