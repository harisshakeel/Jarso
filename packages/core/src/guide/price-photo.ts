import { MAX_GOAL_MINOR } from "@jarso/core/goals";
import { formatMoney, parseMoney } from "@jarso/core/lib";
import { z } from "zod";
import type { GoalProposal } from "./proposal";

/**
 * The photo price check (demo 3): a child photographs a price tag, shelf label or receipt; a
 * small model reads the price and a plain label; the app does the money maths and turns it
 * into a question for Jarso and a goal the child can make with one tap. The image is read once
 * and never stored. The figures the child sees are parsed here, in code, from the text the
 * model returned, never taken from the model as numbers.
 */

/**
 * The largest photo the server accepts, after the browser has shrunk it. Server Actions take
 * bodies up to 1 MB by default and base64 adds a third, so this keeps a photo inside that limit
 * without raising it for every action. A 1024 px JPEG is usually well under 300 KB.
 */
export const MAX_PHOTO_BYTES = 700 * 1024;
/** The longest side the browser scales a photo down to before sending it. */
export const PHOTO_MAX_SIDE = 1024;

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/;

/** Bytes a base64 string decodes to (no decoding). */
function base64Bytes(data: string): number {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

/** A photo as a base64 data URL, a supported type, at most MAX_PHOTO_BYTES. */
export const photoDataUrlSchema = z
  .string()
  .max(Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 64, "That photo is too big. Try another one.")
  .refine((value) => DATA_URL.test(value), "Choose a photo (JPEG, PNG or WebP).")
  .refine((value) => {
    const match = DATA_URL.exec(value);
    return !!match && base64Bytes(match[2] ?? "") <= MAX_PHOTO_BYTES;
  }, "That photo is too big. Try another one.");

export const readPriceSchema = z.object({ image: photoDataUrlSchema });

/** The media type and raw base64 of a checked data URL. */
export function splitDataUrl(dataUrl: string): { mediaType: PhotoType; data: string } {
  const match = DATA_URL.exec(dataUrl);
  if (!match) throw new Error("Not a photo data URL");
  return { mediaType: match[1] as PhotoType, data: match[2] ?? "" };
}

/** What the reading model returns. The price is text; the app parses it. */
export const priceReadingSchema = z.object({
  found: z.boolean(),
  /** The main price as digits, like "12.99", or null. */
  price: z.string().nullable(),
  /** A currency code or symbol if the photo shows one, or null. */
  currency: z.string().nullable(),
  /** The item in at most four plain words, or null. */
  label: z.string().nullable(),
});
export type PriceReading = z.infer<typeof priceReadingSchema>;

/** The price a photo showed, in the family's currency, or nothing usable. */
export type PriceRead =
  | { found: false }
  | { found: true; priceMinor: number; label: string | null; currency: string | null };

/** Digits, a decimal point and thousands commas only: "€12,99" and "$ 12.99" both read. */
function digitsOf(price: string): string {
  const trimmed = price.trim();
  // A comma used as the decimal mark ("12,99"): one comma followed by exactly two digits.
  const decimalComma = /^[^\d]*(\d+),(\d{2})[^\d]*$/.exec(trimmed);
  if (decimalComma) return `${decimalComma[1]}.${decimalComma[2]}`;
  return trimmed.replace(/[^\d.,]/g, "");
}

/**
 * The model's reading checked and parsed. A price that can't be read as money, is zero, or is
 * over the goal cap counts as not found.
 */
export function readPrice(raw: unknown, currency: string): PriceRead {
  const parsed = priceReadingSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.found || !parsed.data.price) return { found: false };
  const priceMinor = parseMoney(digitsOf(parsed.data.price), currency);
  if (!priceMinor || priceMinor > MAX_GOAL_MINOR) return { found: false };
  const label = parsed.data.label?.trim() || null;
  const shown = parsed.data.currency?.trim() || null;
  return { found: true, priceMinor, label, currency: shown };
}

const DOLLAR_CURRENCIES = new Set(["USD", "AUD", "CAD", "NZD", "SGD", "HKD"]);
const SYMBOL_CURRENCY: [string, (family: string) => boolean][] = [
  ["£", (family) => family === "GBP"],
  ["€", (family) => family === "EUR"],
  ["₹", (family) => family === "INR"],
  ["¥", (family) => family === "JPY" || family === "CNY"],
  ["$", (family) => DOLLAR_CURRENCIES.has(family)],
];

/**
 * Whether the currency a photo showed is clearly not the family's (a "$" tag for a family in
 * pounds), so the price can't be read as theirs. Unknown or missing counts as theirs.
 */
export function isOtherCurrency(shown: string | null, familyCurrency: string): boolean {
  if (!shown) return false;
  const text = shown.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(text)) return text !== familyCurrency.toUpperCase();
  for (const [symbol, matches] of SYMBOL_CURRENCY) {
    if (text.includes(symbol)) return !matches(familyCurrency.toUpperCase());
  }
  return false;
}

/** The longest item name a photo gives a question or a goal. */
const LABEL_CHARS = 30;

/**
 * An item name from a photo, tidied for a child's question: at most four whole words within
 * LABEL_CHARS, letters, digits, hyphens and apostrophes only. Null when nothing is left.
 */
export function tidyPhotoLabel(label: string | null): string | null {
  if (!label) return null;
  const words = label
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  let text = "";
  for (const word of words) {
    const next = text ? `${text} ${word}` : word;
    if (next.length > LABEL_CHARS) break;
    text = next;
  }
  // One very long word still gives something to go on.
  if (!text && words[0]) text = words[0].slice(0, LABEL_CHARS);
  return text.length > 0 ? text : null;
}

/** The question the thread sends for the child: "Can I afford £12.99 for headphones?" */
export function priceQuestion(priceMinor: number, label: string | null, currency: string): string {
  const price = formatMoney(priceMinor, currency, { showMinor: "nonzero" });
  if (!label) return `Can I afford ${price}?`;
  // "Headphones" reads as "for headphones"; "LEGO" and "iPad" stay as they are.
  const item = /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;
  return `Can I afford ${price} for ${item}?`;
}

/** What the photo button hands the thread. */
export type PhotoPriceResult =
  | { found: false; reason: "no_price" | "other_currency" }
  | {
      found: true;
      priceMinor: number;
      /** The price as the child sees it ("£12.99"). */
      price: string;
      label: string | null;
      /** A ready question for Jarso, in the child's voice. */
      text: string;
      /** About how many allowances at the child's plan, from the app's maths; null when unknown. */
      allowances: number | null;
      proposal: GoalProposal;
    };
