import { describe, expect, it } from "vitest";
import {
  addDays,
  familyToday,
  formatIsoDate,
  localDateOf,
  startOfWeek,
  utcMidnight,
} from "@/lib/dates";

describe("utcMidnight", () => {
  it("is the start of that calendar day in UTC", () => {
    expect(utcMidnight("2026-11-02").toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });
});

describe("formatIsoDate", () => {
  it("formats the calendar day in en-GB by default", () => {
    expect(formatIsoDate("2026-10-30", { day: "numeric", month: "short" })).toBe("30 Oct");
    expect(formatIsoDate("2026-11-06", { weekday: "short", day: "numeric", month: "short" })).toBe(
      "Fri 6 Nov",
    );
  });

  it("never shifts the day, even when the caller passes another timezone", () => {
    expect(
      formatIsoDate("2026-01-01", { day: "numeric", month: "short", timeZone: "Pacific/Honolulu" }),
    ).toBe("1 Jan");
  });

  it("takes a locale", () => {
    expect(formatIsoDate("2026-11-01", { weekday: "long" }, "en-US")).toBe("Sunday");
  });
});

describe("familyToday", () => {
  it("uses the family's timezone, not UTC", () => {
    const lateUtc = new Date("2026-10-30T23:30:00Z");
    expect(familyToday("Europe/London", lateUtc)).toBe("2026-10-30");
    expect(familyToday("Asia/Tokyo", lateUtc)).toBe("2026-10-31");
    expect(familyToday("America/New_York", new Date("2026-10-31T02:00:00Z"))).toBe("2026-10-30");
  });
});

describe("localDateOf", () => {
  it("converts a timestamp string to the local date", () => {
    expect(localDateOf("2026-10-30T20:00:00+00:00", "Asia/Karachi")).toBe("2026-10-31");
    expect(localDateOf("2026-10-30T20:00:00+00:00", "Europe/London")).toBe("2026-10-30");
  });
});

describe("addDays", () => {
  it("crosses months, years and a daylight-saving change", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-25", 7)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("startOfWeek", () => {
  it("returns the Monday on or before the date", () => {
    expect(startOfWeek("2026-10-30")).toBe("2026-10-26"); // Friday
    expect(startOfWeek("2026-10-26")).toBe("2026-10-26"); // Monday
    expect(startOfWeek("2026-11-01")).toBe("2026-10-26"); // Sunday
  });
});
