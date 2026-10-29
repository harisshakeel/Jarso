import type { ChildDueItem, DueItem, Gift, Schedule } from "./types";

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

/** A running or paused schedule; a stopped one reads like none. */
export function runningSchedule(schedule: Schedule | null): Schedule | null {
  return schedule && schedule.status !== "stopped" ? schedule : null;
}

/** Pending gifts dated after the family's today. Gifts already due are in the due list. */
export function upcomingGifts(gifts: Gift[], today: string): Gift[] {
  return gifts.filter((gift) => gift.giveOn > today);
}
