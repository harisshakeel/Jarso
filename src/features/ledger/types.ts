export type Jar = "spend" | "save";

/** Confirmed (recorded) balances in minor units. Due money is never in a jar. */
export type Jars = { spend: number; save: number };

/**
 * One line of the money history, newest first. `amountMinor` is what reached the jars (null for
 * a skipped allowance). `dueMinor` is set only for an allowance with a shortfall, so the line can
 * read "₹400 of ₹500". `occurredOn` is the family-local ISO date (`YYYY-MM-DD`) of the event.
 * A purchase's `amountMinor` is the positive amount spent (the kind says it went out). `entryId`
 * is the purchase entry, for the undo button; `undone` is true once it was reversed; `canUndo` is
 * decided on the server (a purchase, not undone, under 24 h old).
 */
export type HistoryItem = {
  id: string;
  kind: "allowance" | "gift" | "skipped" | "purchase";
  amountMinor: number | null;
  dueMinor: number | null;
  label: string;
  occurredOn: string;
  undone: boolean;
  entryId: string | null;
  canUndo: boolean;
};
