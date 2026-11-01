export type Jar = "spend" | "save";

/** Confirmed (recorded) balances in minor units. Due money is never in a jar. */
export type Jars = { spend: number; save: number };

/**
 * One line of the money history, newest first. `amountMinor` is what reached the jars (null for
 * a skipped allowance). `dueMinor` is set only for an allowance with a shortfall, so the line can
 * read "₹400 of ₹500". `occurredOn` is the family-local ISO date (`YYYY-MM-DD`) of the event.
 * A purchase's `amountMinor` is the positive amount spent (the kind says it went out). `entryId`
 * is the purchase entry, for the undo button; `undone` is true once it was reversed; `canUndo` is
 * decided on the server (a purchase or received line, not undone, under 24 h from the first
 * entry of its fix chain). `undone` means reversed and not replaced by a fix; a replaced line is
 * dropped. `received` is money the child recorded getting (a diary gift). A withdrawal or deposit is one
 * line for its out/in pair; `amountMinor` is the amount moved. An `extra` is an emergency grant
 * a parent handed over (FR15): new money into Spend. `paidByCard` is true for an allowance or
 * gift the parent handed over by card.
 */
export type HistoryItem = {
  id: string;
  kind:
    | "allowance"
    | "gift"
    | "skipped"
    | "purchase"
    | "withdrawal"
    | "deposit"
    | "extra"
    | "received";
  amountMinor: number | null;
  dueMinor: number | null;
  label: string;
  occurredOn: string;
  undone: boolean;
  entryId: string | null;
  canUndo: boolean;
  paidByCard: boolean;
  /** Raw category key of a purchase or received line, or null (the UI shows null as `other`). */
  category: string | null;
  /** The jar a received line went into, otherwise null. */
  jar: Jar | null;
  /** Server-decided: a purchase or received line, not undone, within 7 days of the chain root. */
  canFix: boolean;
  /** Set on a line that fixes an earlier one: what the earlier line said. */
  fixedFrom: { amountMinor: number; category: string | null; label: string } | null;
};
