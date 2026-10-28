import { describe, expect, it } from "vitest";
import {
  acceptInvitationSchema,
  addChildSchema,
  childSignInSchema,
  createFamilySchema,
  setChildPinSchema,
  startChildOnboardingSchema,
} from "./schemas";

const child = { nickname: " Sam ", pin: "1234", consent: "on" };

describe("family schemas", () => {
  it("accepts a valid child and trims nickname", () => {
    expect(addChildSchema.parse(child).nickname).toBe("Sam");
    expect(addChildSchema.safeParse({ ...child, consent: true }).success).toBe(true);
  });

  it.each(["12a4", "123", "1234567"])("rejects pin %s", (pin) => {
    expect(addChildSchema.safeParse({ ...child, pin }).success).toBe(false);
  });

  it("rejects missing consent and bad nicknames", () => {
    expect(addChildSchema.safeParse({ nickname: "Sam", pin: "1234" }).success).toBe(false);
    expect(addChildSchema.safeParse({ ...child, consent: "off" }).success).toBe(false);
    expect(addChildSchema.safeParse({ ...child, nickname: "   " }).success).toBe(false);
    expect(addChildSchema.safeParse({ ...child, nickname: "x".repeat(21) }).success).toBe(false);
  });

  it("validates parent email", () => {
    expect(
      startChildOnboardingSchema.safeParse({ nickname: "Sam", parentEmail: "nope" }).success,
    ).toBe(false);
    expect(
      startChildOnboardingSchema.safeParse({ nickname: "Sam", parentEmail: "a@b.co" }).success,
    ).toBe(true);
  });

  it("validates currency and timezone", () => {
    expect(
      createFamilySchema.safeParse({ currency: "GBP", timezone: "Europe/London" }).success,
    ).toBe(true);
    expect(createFamilySchema.safeParse({ currency: "GBP", timezone: "Mars/Base" }).success).toBe(
      false,
    );
    expect(createFamilySchema.safeParse({ currency: "XXX", timezone: "UTC" }).success).toBe(false);
  });

  it("accepts invitation, sign-in and set-pin input", () => {
    expect(
      acceptInvitationSchema.safeParse({ invite: "ABCD2345", pin: "1234", consent: "on" }).success,
    ).toBe(true);
    expect(
      childSignInSchema.safeParse({ familyCode: "abc234", nickname: "Sam", pin: "1234" }).success,
    ).toBe(true);
    expect(setChildPinSchema.safeParse({ childId: "nope", pin: "1234" }).success).toBe(false);
    expect(setChildPinSchema.safeParse({ childId: crypto.randomUUID(), pin: "1234" }).success).toBe(
      true,
    );
  });
});
