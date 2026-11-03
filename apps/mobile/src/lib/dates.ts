const dayFormat = (timeZone: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone });

/** An instant as "2 Nov", on the day it was in the family's timezone (the web's wording). */
export function dayInZone(iso: string, timeZone: string): string {
  return dayFormat(timeZone).format(new Date(iso));
}

/** `YYYY-MM-DD` as "2 Nov", without shifting the day. */
export function dayOfDate(isoDate: string): string {
  return dayFormat("UTC").format(new Date(`${isoDate}T00:00:00Z`));
}
