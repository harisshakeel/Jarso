import { childSignInLink, parseChildSignInLink } from "@jarso/core/family";
import { describe, expect, it } from "vitest";

describe("child sign-in link", () => {
  it("carries the family code and nickname only", () => {
    expect(childSignInLink({ familyCode: "KQ74MX", nickname: "Sam" })).toBe(
      "jarso://sign-in?code=KQ74MX&nickname=Sam",
    );
  });

  it("round-trips a nickname with a space and an apostrophe", () => {
    const link = childSignInLink({ familyCode: "KQ74MX", nickname: "Mia O'Neil" });
    expect(parseChildSignInLink(link)).toEqual({ familyCode: "KQ74MX", nickname: "Mia O'Neil" });
  });

  it("round-trips a nickname in another script", () => {
    const link = childSignInLink({ familyCode: "KQ74MX", nickname: "आरव" });
    expect(parseChildSignInLink(link)).toEqual({ familyCode: "KQ74MX", nickname: "आरव" });
  });

  it("normalises the code to capitals without spaces or dashes", () => {
    expect(parseChildSignInLink(" jarso://sign-in?code=kq7-4mx&nickname=Sam ")).toEqual({
      familyCode: "KQ74MX",
      nickname: "Sam",
    });
  });

  it("ignores a PIN, a next path and anything else in the link", () => {
    const parsed = parseChildSignInLink(
      "jarso://sign-in?code=KQ74MX&pin=1234&next=%2F%2Fevil.com&nickname=Sam",
    );
    expect(parsed).toEqual({ familyCode: "KQ74MX", nickname: "Sam" });
    expect(JSON.stringify(parsed)).not.toContain("1234");
  });

  it.each([
    "",
    "KQ74MX",
    "https://jarso.vercel.app/sign-in?code=KQ74MX&nickname=Sam",
    "jarso://stripe-redirect?code=KQ74MX&nickname=Sam",
    "jarso://sign-in/x?code=KQ74MX&nickname=Sam",
    "jarso://sign-in?code=KQ74MX",
    "jarso://sign-in?nickname=Sam",
    "jarso://sign-in?code=KQ74MX&nickname=",
    "jarso://sign-in?code=ABCDEFGHJKLMNPQRS&nickname=Sam",
    "jarso://sign-in?code=K!7&nickname=Sam",
    "jarso://sign-in?code=KQ74MX&nickname=sam%40mail.com",
    "jarso://sign-in?code=KQ74MX&nickname=%E0%A4%A",
  ])("refuses %j", (text) => {
    expect(parseChildSignInLink(text)).toBeNull();
  });
});
