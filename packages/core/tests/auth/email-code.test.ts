import { EMAIL_CODE_LENGTH, emailCodeSchema } from "@jarso/core/auth";
import { describe, expect, it } from "vitest";

describe("emailCodeSchema", () => {
  it("is six digits by default", () => {
    expect(EMAIL_CODE_LENGTH).toBe(6);
  });

  it.each([
    ["123456", "123456"],
    [" 123 456 ", "123456"],
    // The hosted project sends 8 digits until its otp_length is pushed.
    ["12345678", "12345678"],
  ])("accepts %j as %j", (input, expected) => {
    expect(emailCodeSchema.parse(input)).toBe(expected);
  });

  it.each(["12345", "123456789", "12a456", ""])("refuses %j", (input) => {
    expect(emailCodeSchema.safeParse(input).success).toBe(false);
  });
});
