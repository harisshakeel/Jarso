export type PurchaseResult =
  | { status: "recorded"; entryId: string }
  | { status: "not_enough_spend"; freeMinor: number };

export type UndoResult = "undone" | "already_undone" | "too_late";
