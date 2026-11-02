/** Earliest date of birth the form and the database accept. */
export const EARLIEST_BIRTH_DATE = "1900-01-01";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The latest date of birth of someone who is 18 today, as YYYY-MM-DD (UTC). Mirrors Postgres
 * `current_date - interval '18 years'`, which clamps 29 February to 28 February in a common
 * year instead of rolling over to 1 March.
 */
export function latestAdultBirthDate(today: Date = new Date()): string {
  const year = today.getUTCFullYear() - 18;
  const month = today.getUTCMonth();
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(today.getUTCDate(), lastDayOfMonth);
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** True when an ISO date (YYYY-MM-DD) belongs to someone aged 18 or over today. */
export function isAdultBirthDate(dateOfBirth: string, today: Date = new Date()): boolean {
  return dateOfBirth >= EARLIEST_BIRTH_DATE && dateOfBirth <= latestAdultBirthDate(today);
}
