import "server-only";

/**
 * Removes contact details from a child's message before it is stored or sent to Claude (spec
 * §5.2 step 3): emails, links, phone numbers and long digit runs (card numbers, PINs with
 * spaces, account numbers). Money like "12.50" or "£1,000" stays. Best effort: the input
 * screen and the guide's rules are the next layers.
 */

const PATTERNS: RegExp[] = [
  // Emails.
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // Links with a scheme or www.
  /\b(?:https?:\/\/|www\.)\S+/gi,
  // Bare domains such as example.com/path or name.co.uk.
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|uk|io|app|me|info|biz|us)\b(?:\/\S*)?/gi,
  // Phone numbers: an optional +, then 7 or more digits with spaces, dots, dashes or brackets.
  /\+?\(?\d[\d\s().-]{6,}\d/g,
];

/** Six or more digits in a row (after the patterns above): codes, PINs, account numbers. */
const LONG_DIGITS = /\d{6,}/g;

const REMOVED = "[removed]";

export function scrub(text: string): string {
  let out = text;
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, (match) => (isMoney(match) ? match : REMOVED));
  }
  return out.replace(LONG_DIGITS, REMOVED);
}

/** "12.50", "1,000", "1,000.50": money-shaped numbers are not contact details. */
function isMoney(match: string): boolean {
  return /^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(match.trim()) || /^\d+\.\d{1,2}$/.test(match.trim());
}
