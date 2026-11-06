import { formatMoney } from "@jarso/core/lib";
import type { EntryVersion, FixResult } from "./types";

/** What a child sees when a purchase is more than the Spend jar holds. */
export function notEnoughSpendMessage(freeMinor: number, currency: string): string {
  return freeMinor <= 0
    ? "Your Spend jar is empty right now. Record money you got first, or ask a parent."
    : `That's more than you have in Spend (${formatMoney(freeMinor, currency, { showMinor: "nonzero" })}). Record money you got first, or ask a parent.`;
}

export const notEnoughSaveMessage =
  "Some of your Save is waiting to come out, so this can't be undone right now.";
export const notEnoughSaveToFixMessage =
  "Some of your Save is waiting to come out, so this can't be lowered right now.";
export const notFixableMessage = "This one can't be fixed any more.";
export const unchangedMessage = "Nothing changed.";
export const notEnoughSpendToUndoMessage =
  "You've spent some of this already, so it can't be undone.";

/** A fix to a purchase that needs more Spend than there is. `freeMinor` is the free Spend right now. */
export function notEnoughSpendToRaiseMessage(
  currentMinor: number,
  freeMinor: number,
  currency: string,
): string {
  return `That's more than you have in Spend. The most it can be is ${formatMoney(currentMinor + freeMinor, currency, { showMinor: "nonzero" })}.`;
}

/** A fix that lowers money received into Spend after some of it was spent. */
export function notEnoughSpendToLowerMessage(
  currentMinor: number,
  freeMinor: number,
  currency: string,
): string {
  return `You've spent some of this already. The least it can be is ${formatMoney(Math.max(currentMinor - freeMinor, 0), currency, { showMinor: "nonzero" })}.`;
}

/** The line after a purchase or money received is saved. */
export const entrySavedMessage = "Written down. Nice one.";

/** The line after an undo: a purchase puts the money back in Spend, money received comes out of its jar. */
export const undoneSpendMessage = "Undone. The money is back in Spend.";
export const undoneReceivedMessage = "Undone. It's out of your jar.";

/** The name field's hint follows the category chip: a snack asks "What snack?". */
export const NAME_HINTS: Record<string, string> = {
  snacks: "What snack?",
  games: "What game?",
  clothes: "What clothes?",
  going_out: "Where did you go?",
  gift_for_someone: "What gift?",
  school: "What for school?",
  travel: "Where to?",
  apps: "Which app?",
};
export const DEFAULT_NAME_HINT = "What was it?";

/**
 * What the child sees after a fix that did not go through; null when it was fixed. `currentMinor`
 * is the line's amount before the fix. "unchanged" is a notice, the rest are refusals.
 */
export function fixRefusalMessage(
  result: FixResult,
  kind: "purchase" | "received",
  currency: string,
  currentMinor: number,
): string | null {
  switch (result.status) {
    case "fixed":
      return null;
    case "unchanged":
      return unchangedMessage;
    case "not_fixable":
      return notFixableMessage;
    case "not_enough_spend":
      return kind === "received"
        ? notEnoughSpendToLowerMessage(currentMinor, result.freeMinor, currency)
        : notEnoughSpendToRaiseMessage(currentMinor, result.freeMinor, currency);
    case "not_enough_save":
      return notEnoughSaveToFixMessage;
  }
}

/** The database labels a nameless line with these; the forms show them as an empty name. */
export const FALLBACK_LABELS = ["Purchase", "Money received"];

/** "Got money" sheet copy. */
export const receivedCopy = {
  trigger: "Got money",
  title: "What did you get?",
  description: "It goes into your jar right away.",
  categoryLegend: "Where did it come from?",
  jarLegend: "Which jar?",
  jars: [
    { value: "spend", label: "Spend" },
    { value: "save", label: "Save" },
  ],
  saveHint: "Give the cash to your parent to keep.",
  nameLabel: "Name it (optional)",
  namePlaceholder: "Who or what was it?",
  submit: "Write it down",
  pickCategory: "Pick where it came from",
} as const;

/** A diary line, opened, and its fix form. */
export const entryDetailCopy = {
  /** "Details for Chips": the label of the button that opens a line. */
  detailsFor: (label: string) => `Details for ${label}`,
  fix: "Fix this",
  undo: "Undo",
  earlierVersions: "Earlier versions",
  noEarlierVersions: "No earlier versions.",
  fixed: "Fixed.",
  purchaseCategoryLegend: "What was it for?",
  receivedCategoryLegend: "Where did it come from?",
  nameLabel: "Name it (optional)",
  jarsHint: "To move money between jars, put it in or take it out.",
  saveFix: "Save the fix",
} as const;

/** A line's earlier versions, newest first, without the current one. Input is oldest first. */
export function earlierVersions(versions: EntryVersion[], currentId: string): EntryVersion[] {
  return versions.filter((v) => v.id !== currentId).reverse();
}

/** Purchases kept on the device that the server hasn't taken yet (the pending card). */
export const pendingCopy = {
  heading: "Not sent yet",
  /** A purchase with no name of its own. */
  fallbackLabel: "Purchase",
  change: "Change it",
  askAParent: "Ask a parent",
  remove: "Remove",
  /** Accessible names: "Change it: Crisps". */
  changeFor: (label: string) => `Change it: ${label}`,
  askAParentFor: (label: string) => `Ask a parent: ${label}`,
  removeFor: (label: string) => `Remove: ${label}`,
  askAParentNote: "Show this to a parent and decide together.",
  /** Asked before Remove, since it can't be undone. */
  removeTitle: (label: string) => `Remove "${label}"?`,
  removeBody: "It hasn't been written down yet, so it will be gone.",
  keep: "Keep it",
} as const;

/** The Diary page's own lines. */
export const diaryCopy = {
  heading: "Diary",
  spendJarLabel: "Spend jar",
  /** The Spend chip on the Diary (2026-11-06): the jar's name before its amount. */
  spendChip: "Spend",
  /** "You have" ‹amount› "in Spend." The amount sits between, styled as money. */
  youHave: "You have",
  inSpend: "in Spend.",
  /** One opened line that is no longer there (or was never the child's). */
  notFound: "We couldn't find that.",
  backToDiary: "Back to the diary",
} as const;

/** The phone's "I bought something" flow (amount, what on, done). */
export const purchaseFlowCopy = {
  howMuch: "How much?",
  onWhat: "On what?",
  next: "Next",
  spendHas: (m: string) => `Spend has ${m}`,
  nameHint: (hint: string) => `${hint} (if you want)`,
  done: (m: string, label: string) => `Done · ${m} ${label.toLowerCase()}`,
  celebrate: "Written down!",
  celebrateSub: (m: string, label: string) => `${m} · ${label}`,
  nice: "Nice",
  undo: "Undo",
} as const;

/** The phone's "I got money" flow (amount, where from, which jar). */
export const receivedFlowCopy = {
  howMuch: "How much?",
  got: (m: string) => `Got ${m}!`,
  from: "From",
  putItIn: "Put it in",
  spend: { label: "Spend", hint: "Keep the cash" },
  save: { label: "Save", hint: (parent: string) => `Give it to ${parent}` },
  submit: (jar: "Spend" | "Save") => `Put it in ${jar}`,
  goalAfter: (emoji: string, name: string, m: string) => `${emoji} ${name}: ${m} to go after this!`,
} as const;
