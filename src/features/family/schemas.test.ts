import { describe, expect, it } from "vitest";
import {
  acceptInvitationSchema,
  addChildSchema,
  childSignInSchema,
  createFamilySchema,
  inviteParamsSchema,
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

  it.each(["Zoë", "Ελένη", "Sam 2", "O'Neil", "Mary-Jo", "j.r_b", "Ana"])(
    "accepts nickname %s",
    (nickname) => {
      expect(addChildSchema.safeParse({ ...child, nickname }).success).toBe(true);
    },
  );

  it.each(["a@b.co", "see http://x", "<b>", "Sam!", "😀", "x²"])(
    "rejects nickname %s",
    (nickname) => {
      expect(addChildSchema.safeParse({ ...child, nickname }).success).toBe(false);
      expect(
        startChildOnboardingSchema.safeParse({ nickname, parentEmail: "a@b.co" }).success,
      ).toBe(false);
    },
  );

  it("normalises decomposed accents so they count as letters", () => {
    expect(addChildSchema.parse({ ...child, nickname: "Zoe\u0308" }).nickname).toBe("Zoë");
  });

  it("bounds child sign-in input", () => {
    const valid = { familyCode: "abc-234", nickname: "Sam", pin: "1234" };
    expect(childSignInSchema.safeParse(valid).success).toBe(true);
    expect(childSignInSchema.safeParse({ ...valid, familyCode: "A".repeat(17) }).success).toBe(
      false,
    );
    expect(childSignInSchema.safeParse({ ...valid, nickname: "x".repeat(21) }).success).toBe(false);
    for (const pin of ["", "123", "1234567", "12a4", "1".repeat(1000)]) {
      expect(childSignInSchema.safeParse({ ...valid, pin }).success).toBe(false);
    }
  });

  it("bounds the invite value", () => {
    const valid = { invite: "x".repeat(128), pin: "1234", consent: "on" };
    expect(acceptInvitationSchema.safeParse(valid).success).toBe(true);
    expect(acceptInvitationSchema.safeParse({ ...valid, invite: "x".repeat(129) }).success).toBe(
      false,
    );
  });

  it("parses /invite search params: first value, trimmed, at most 128 characters", () => {
    expect(inviteParamsSchema.parse({ token: [" abc ", "def"], code: "x" })).toEqual({
      token: "abc",
      code: "x",
    });
    expect(inviteParamsSchema.parse({ token: "x".repeat(129), code: "  " })).toEqual({
      token: undefined,
      code: undefined,
    });
    expect(inviteParamsSchema.parse({})).toEqual({ token: undefined, code: undefined });
  });
});
