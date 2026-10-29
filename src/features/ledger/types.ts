export type Jar = "spend" | "save";

/** Confirmed (recorded) balances in minor units. Due money is never in a jar. */
export type Jars = { spend: number; save: number };

/**
 * One line of the money history, newest first. `amountMinor` is what reached the jars (null for
 * a skipped allowance). `dueMinor` is set only for an allowance with a shortfall, so the line can
 * read "₹400 of ₹500". `occurredOn` is the family-local ISO date (`YYYY-MM-DD`) of the event.
 */
export type HistoryItem = {
  id: string;
  kind: "allowance" | "gift" | "skipped";
  amountMinor: number | null;
  dueMinor: number | null;
  label: string;
  occurredOn: string;
};
