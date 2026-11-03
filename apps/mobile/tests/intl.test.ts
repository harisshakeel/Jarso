// Core's money, date, describe and sent-ago helpers lean on Intl (currency NumberFormat,
// PluralRules, RelativeTimeFormat, time zones). Expected strings are the ones core's own node
// tests assert (packages/core/tests/{lib,allowance,family,notifications}), so the app formats
// exactly as the web does.
import { describeCadence, describeSchedule } from "@jarso/core/allowance";
import { sentAgo } from "@jarso/core/family";
import { familyToday, formatMoney, localDateOf, parseMoney } from "@jarso/core/lib";

describe("formatMoney", () => {
  it("formats GBP as core's tests expect", () => {
    expect(formatMoney(300, "GBP")).toBe("£3.00");
    expect(formatMoney(500, "GBP", { showMinor: "nonzero" })).toBe("£5");
    expect(formatMoney(350, "GBP", { showMinor: "nonzero" })).toBe("£3.50");
    expect(formatMoney(100_000_000_000, "GBP", { showMinor: "nonzero" })).toBe("£1,000,000,000");
  });

  it("formats INR as core's tests expect", () => {
    expect(formatMoney(50050, "INR")).toContain("500.50");
    expect(formatMoney(50000, "INR")).toContain("500.00");
    const whole = formatMoney(50000, "INR", { showMinor: "nonzero" });
    expect(whole).toContain("500");
    expect(whole).not.toContain(".00");
  });

  it("formats JPY with no minor digits, as core does on node", () => {
    expect(formatMoney(500, "JPY")).toBe("JP¥500");
  });

  it.each(["INR", "GBP", "USD", "EUR", "AUD", "CAD", "JPY"])(
    "round-trips %s through formatMoney and parseMoney",
    (currency) => {
      for (const minor of [550, 50050, 100000]) {
        expect(parseMoney(formatMoney(minor, currency), currency)).toBe(minor);
      }
    },
  );
});

describe("family dates", () => {
  it("uses the Asia/Kolkata timezone, not the device's", () => {
    expect(familyToday("Asia/Kolkata", new Date("2026-10-29T23:30:00Z"))).toBe("2026-10-30");
    expect(familyToday("Europe/London", new Date("2026-10-29T23:30:00Z"))).toBe("2026-10-29");
    expect(localDateOf("2026-10-30T20:00:00+00:00", "Asia/Karachi")).toBe("2026-10-31");
  });

  it("familyToday returns expected fixed values", () => {
    // Expected days are node's (full ICU). This runs on node with the polyfills, not on Hermes:
    // Hermes parity needs the device run.
    expect(familyToday("Asia/Kolkata", new Date("2026-03-28T18:29:00Z"))).toBe("2026-03-28");
    expect(familyToday("Asia/Kolkata", new Date("2026-03-28T18:30:00Z"))).toBe("2026-03-29");
    // British Summer Time: midnight is 23:00 UTC.
    expect(familyToday("Europe/London", new Date("2026-07-01T22:59:00Z"))).toBe("2026-07-01");
    expect(familyToday("Europe/London", new Date("2026-07-01T23:00:00Z"))).toBe("2026-07-02");
    expect(familyToday("Europe/London", new Date("2026-12-31T23:59:00Z"))).toBe("2026-12-31");
  });

  it("describes allowance schedules", () => {
    expect(describeCadence("weekly", "2025-11-02", "en-GB")).toBe("Every Sunday");
    expect(describeCadence("monthly", "2026-01-31", "en-GB")).toBe("Every month on the 31st");
    expect(describeSchedule("monthly", "2026-01-13")).toBe("Every month on the 13th from 13 Jan");
  });
});

describe("sentAgo", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("says when a request was sent", () => {
    expect(sentAgo(ago(30_000), now)).toBe("Sent just now");
    expect(sentAgo(ago(60_000), now)).toBe("Sent 1 minute ago");
    expect(sentAgo(ago(59 * 60_000), now)).toBe("Sent 59 minutes ago");
    expect(sentAgo(ago(3 * 3_600_000), now)).toBe("Sent 3 hours ago");
    expect(sentAgo(ago(25 * 3_600_000), now)).toBe("Sent yesterday");
    expect(sentAgo(ago(6 * 86_400_000), now)).toBe("Sent 6 days ago");
  });
});
