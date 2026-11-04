import type { Route } from "next";

/**
 * The success dialog (design.md §6, "Success dialog"): a moment worth stopping for, such as a
 * gift set up, money added to a child's Save, a request approved or a goal set. Small saves
 * (a name, a setting, a copied link) stay a toast. Call `celebrate()` from any client code,
 * like `toast.success`; the one `CelebrationHost` in the app's providers shows it. Two at once
 * queue, one after the other.
 */
export type Celebration = {
  /** Short and warm, sentence case, no "successfully": "Gift on its way". */
  title: string;
  /** One line on what happens next: "Sam will see it on Friday 6 November." */
  body?: string;
  /** A money figure, already formatted, shown large above the title. */
  amount?: string;
  /** The picture in the badge; "money" also chooses the coins sound. */
  icon?: "check" | "gift" | "coins" | "send" | "target";
  /** The main button; "Done" by default. */
  doneLabel?: string;
  /** An optional second step, as a quiet link under the main button. */
  action?: { label: string; href: Route };
};

/** A queued celebration with its place in line, so the dialog can tell two alike apart. */
export type QueuedCelebration = Celebration & { seq: number };

type Listener = () => void;
let queue: QueuedCelebration[] = [];
let seq = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

/** Shows the success dialog (after any already showing). */
export function celebrate(celebration: Celebration): void {
  seq += 1;
  queue = [...queue, { ...celebration, seq }];
  emit();
}

/** Closes the one showing; the next in line, if any, follows. */
export function dismissCelebration(): void {
  queue = queue.slice(1);
  emit();
}

export function subscribeCelebrations(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentCelebration(): QueuedCelebration | null {
  return queue[0] ?? null;
}

/** For tests. */
export function resetCelebrationsForTests(): void {
  queue = [];
  emit();
}
