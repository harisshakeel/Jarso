// Calendar-date helpers. Dates are ISO `YYYY-MM-DD` strings in the family's timezone; day
// arithmetic runs in UTC so no timezone or daylight-saving change shifts a day.

const isoDateFormats = new Map<string, Intl.DateTimeFormat>();

function isoDateFormat(timezone: string): Intl.DateTimeFormat {
  let format = isoDateFormats.get(timezone);
  if (!format) {
    // en-CA formats dates as YYYY-MM-DD.
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    isoDateFormats.set(timezone, format);
  }
  return format;
}

/** The family's local date, ISO `YYYY-MM-DD`. */
export function familyToday(timezone: string, now: Date = new Date()): string {
  return isoDateFormat(timezone).format(now);
}

/** The local date of an instant (a `timestamptz` string or Date) in a timezone. */
export function localDateOf(instant: string | Date, timezone: string): string {
  return isoDateFormat(timezone).format(typeof instant === "string" ? new Date(instant) : instant);
}

/** ISO `YYYY-MM-DD` plus whole days, in UTC so no timezone shifts the day. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The Monday on or before an ISO date: weeks run Monday to Sunday. */
export function startOfWeek(isoDate: string): string {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return addDays(isoDate, -((day + 6) % 7));
}
