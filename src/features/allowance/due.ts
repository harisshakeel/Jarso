import type { ChildDueItem, DueItem } from "./types";

/** One child's due items, as read for that child. */
export type ChildDue = { child: { id: string; nickname: string }; due: DueItem[] };

/**
 * Every child's due items in one list, oldest first. Items due the same day keep the order the
 * children were given in (and each child's own order), so the list never shuffles on reload.
 */
export function mergeDue(perChild: ChildDue[]): ChildDueItem[] {
  return perChild
    .flatMap(({ child, due }) =>
      due.map((item) => ({ ...item, childId: child.id, nickname: child.nickname })),
    )
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}
