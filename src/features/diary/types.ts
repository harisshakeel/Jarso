export type PurchaseResult =
  | { status: "recorded"; entryId: string }
  | { status: "not_enough_spend"; freeMinor: number };

export type ReceivedResult = { status: "recorded"; entryId: string };

export type UndoResult =
  | "undone"
  | "already_undone"
  | "too_late"
  | "not_enough_spend"
  | "not_enough_save";

/** `freeMinor` is the free Spend right now, not the largest amount the line could be fixed to. */
export type FixResult =
  | { status: "fixed"; entryId: string }
  | { status: "unchanged" }
  | { status: "not_fixable" }
  | { status: "not_enough_spend"; freeMinor: number }
  | { status: "not_enough_save" };

export type EntryVersion = {
  id: string;
  amountMinor: number;
  category: string | null;
  label: string;
  createdAt: string;
};
