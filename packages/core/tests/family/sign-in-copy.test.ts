import { childScanCopy, childSignInCopy } from "@jarso/core/family";
import { describe, expect, it } from "vitest";

describe("childSignInCopy", () => {
  it("keeps the exact words the web and the phone show", () => {
    expect(childSignInCopy).toEqual({
      heading: "Welcome back. Let's sign in.",
      subline: "Use your family code, your nickname and your PIN.",
      familyCodeHint: "Your parent can find it in their Settings.",
    });
  });
});

describe("childScanCopy", () => {
  it("is short, kind and never says PIN digits aloud", () => {
    expect(childScanCopy.pin).toBe("Your PIN");
    expect(childScanCopy.pinTyped(1)).toBe("1 number typed");
    expect(childScanCopy.pinTyped(4)).toBe("4 numbers typed");
    for (const label of [childScanCopy.scan, childScanCopy.close, childScanCopy.delete]) {
      expect(label.split(" ").length).toBeLessThanOrEqual(3);
    }
    expect(JSON.stringify(childScanCopy)).not.toMatch(/\b(wrong|fail|error|invalid)\b/i);
  });
});
