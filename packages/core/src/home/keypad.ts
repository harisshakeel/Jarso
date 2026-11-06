import { minorDigits } from "@jarso/core/lib";

// The on-screen number pad the money flows use. Pure: it only builds the typed text.

export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "back";

/** The pad's order, row by row. */
export const KEYPAD_KEYS: readonly KeypadKey[] = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  ".",
  "0",
  "back",
];

const MAX_WHOLE_DIGITS = 6;

/** The text after one key press. Presses that would make a bad amount change nothing. */
export function pressKey(value: string, key: KeypadKey, currency: string): string {
  if (key === "back") return value.slice(0, -1);
  const digits = minorDigits(currency);
  const dot = value.indexOf(".");
  if (key === ".") {
    if (digits === 0 || dot !== -1) return value;
    return value === "" ? "0." : `${value}.`;
  }
  if (dot !== -1) return value.length - dot - 1 >= digits ? value : value + key;
  if (value === "0") return key;
  return value.length >= MAX_WHOLE_DIGITS ? value : value + key;
}

const CHIPS: Record<string, readonly number[]> = {
  INR: [10, 20, 50, 100],
  JPY: [100, 500, 1000, 5000],
};
const DEFAULT_CHIPS = [1, 2, 5, 10];

/** Quick amounts to tap, in minor units. Any above the limit are dropped. */
export function quickChips(currency: string, limitMinor?: number | null): number[] {
  const factor = 10 ** minorDigits(currency);
  return (CHIPS[currency] ?? DEFAULT_CHIPS)
    .map((major) => major * factor)
    .filter((minor) => limitMinor == null || minor <= limitMinor);
}
