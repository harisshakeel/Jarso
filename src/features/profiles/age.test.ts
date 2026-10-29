import { describe, expect, it } from "vitest";
import { isAdultBirthDate, latestAdultBirthDate } from "./age";

const on = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("latestAdultBirthDate", () => {
  it("is the same day 18 years earlier", () => {
    expect(latestAdultBirthDate(on("2026-10-29"))).toBe("2008-10-29");
  });

  it("clamps 29 February to 28 February like Postgres does", () => {
    expect(latestAdultBirthDate(on("2024-02-29"))).toBe("2006-02-28");
  });
});

describe("isAdultBirthDate", () => {
  const today = on("2026-10-29");

  it("accepts someone who turns 18 today", () => {
    expect(isAdultBirthDate("2008-10-29", today)).toBe(true);
  });

  it("refuses someone who turns 18 tomorrow", () => {
    expect(isAdultBirthDate("2008-10-30", today)).toBe(false);
  });

  it("refuses dates before 1900", () => {
    expect(isAdultBirthDate("1899-12-31", today)).toBe(false);
    expect(isAdultBirthDate("1900-01-01", today)).toBe(true);
  });
});
