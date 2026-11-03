import type { UndoResult } from "@jarso/core/diary";
import { AppError } from "@jarso/core/lib";
import { type Client, callUndoDiaryEntry } from "./repository";

/** Undoes a purchase or money received within a day. Later than that is a CONFLICT. */
export async function undoEntry(db: Client, entryId: string): Promise<UndoResult> {
  const result = await callUndoDiaryEntry(db, entryId);
  if (result === "too_late") {
    throw new AppError("CONFLICT", "You can only undo within a day.");
  }
  return result;
}
