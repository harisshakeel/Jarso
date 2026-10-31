import { describe, expect, it } from "vitest";
import { isComeback } from "./comeback";

describe("isComeback", () => {
  it("is true three or more days after the last learning day", () => {
    expect(isComeback("2026-10-27", "2026-10-30")).toBe(true);
    expect(isComeback("2026-10-20", "2026-10-30")).toBe(true);
  });
  it("is false within two days, and before any learning", () => {
    expect(isComeback("2026-10-28", "2026-10-30")).toBe(false);
    expect(isComeback("2026-10-30", "2026-10-30")).toBe(false);
    expect(isComeback(null, "2026-10-30")).toBe(false);
  });
});
