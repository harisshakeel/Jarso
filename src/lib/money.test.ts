import { describe, expect, it } from "vitest";
import { formatMoney, minorDigits, parseMoney } from "./money";

describe("minorDigits", () => {
  it("returns currency fraction digits", () => {
    expect(minorDigits("JPY")).toBe(0);
    expect(minorDigits("GBP")).toBe(2);
  });
});

describe("parseMoney", () => {
  it.each([
    ["5", 500],
    ["5.5", 550],
    ["5.50", 550],
    [" 5 ", 500],
    ["₹5", 500],
    ["1,000", 100000],
  ])("parses %j as %i (INR)", (input, minor) => {
    expect(parseMoney(input, "INR")).toBe(minor);
  });

  it.each(["5.555", "-1", "abc", "", "0.001"])("rejects %j", (input) => {
    expect(parseMoney(input, "INR")).toBeNull();
  });

  it("handles zero-decimal currencies", () => {
    expect(parseMoney("500", "JPY")).toBe(500);
    expect(parseMoney("5.5", "JPY")).toBeNull();
  });

  it("strips multi-character symbols", () => {
    expect(parseMoney("A$5", "AUD")).toBe(500);
    expect(parseMoney("£5.25", "GBP")).toBe(525);
  });
});

describe("formatMoney", () => {
  it("hides zero minor units when nonzero", () => {
    const out = formatMoney(50000, "INR", { showMinor: "nonzero" });
    expect(out).toContain("500");
    expect(out).not.toContain(".00");
  });
  it("shows minor units by default", () => {
    expect(formatMoney(50050, "INR")).toContain("500.50");
    expect(formatMoney(50000, "INR")).toContain("500.00");
  });
  it("keeps minor units when nonzero and present", () => {
    expect(formatMoney(50050, "INR", { showMinor: "nonzero" })).toContain("500.50");
  });
  it("formats zero-decimal currencies", () => {
    expect(formatMoney(500, "JPY")).toContain("500");
  });
});
