import { childSignInCopy } from "@jarso/core/family";
import { describe, expect, it } from "vitest";

describe("childSignInCopy", () => {
  it("keeps the exact words the web and the phone show", () => {
    expect(childSignInCopy).toEqual({
      heading: "Welcome back. Let's sign in.",
      subline: "Use your family code, your nickname and your PIN.",
      familyCodeHint: "Your parent can find it on their Jarso home.",
    });
  });
});
