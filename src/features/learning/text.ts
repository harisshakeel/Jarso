import { formatMoney } from "@/lib";

/** `{m:1250}` in content text: a fictional amount in minor units, shown in the family currency. */
const MONEY_TOKEN = /\{m:(\d{1,9})\}/g;

/** Replaces every money token with the amount in the family currency ("£12.50", "£4"). */
export function renderText(text: string, currency: string): string {
  return text.replace(MONEY_TOKEN, (_match, minor: string) =>
    formatMoney(Number(minor), currency, { showMinor: "nonzero" }),
  );
}

/** Content text without its money tokens' markup, for word counts and plain-text checks. */
export function plainText(text: string): string {
  return text.replace(MONEY_TOKEN, "£$1");
}

/** Words in a piece of content text; a money token counts as one word. */
export function wordCount(text: string): number {
  return plainText(text).trim().split(/\s+/).filter(Boolean).length;
}

const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** An ISO date (`YYYY-MM-DD`) as "30 Oct". */
export function formatShortDate(isoDate: string): string {
  return shortDate.format(new Date(`${isoDate}T00:00:00Z`));
}
