import { describe, expect, it } from "vitest";
import { childEmail, generateCode, generateToken, hashSecret, normaliseFamilyCode } from "./codes";

describe("codes", () => {
  it("normalises family codes", () => {
    expect(normaliseFamilyCode(" abc-23x ")).toBe("ABC23X");
  });

  it("generates codes from the safe alphabet", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateCode(6)).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(generateCode(8)).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    }
  });

  it("generates distinct 64-char hex tokens", () => {
    const a = generateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(generateToken()).not.toBe(a);
  });

  it("hashes to stable SHA-256 hex", async () => {
    const h = await hashSecret("x");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashSecret("x")).toBe(h);
    expect(h).toBe("2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881");
  });

  it("builds child emails", () => {
    expect(childEmail("abc")).toBe("abc@child.jarso.invalid");
  });
});
