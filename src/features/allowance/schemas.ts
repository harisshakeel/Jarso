import { z } from "zod";
import { addDays, formatMoney, MAX_AMOUNT_MINOR, minorDigits, parseMoney } from "@/lib";
import { frequencies } from "./types";

/**
 * Schemas are factories: money is a major-unit string parsed with the family currency, and dates
 * are checked against the family's `today` (ISO `YYYY-MM-DD`, see `familyToday`). The database
 * functions re-check everything.
 */

const MAX_TEXT = 140;
/** Dates a parent picks are at most this far ahead (the database functions cap them too). */
const MAX_DAYS_AHEAD = 366;

// The date helpers moved to @/lib; re-exported so this module's callers keep working.
export { addDays, familyToday } from "@/lib";

function moneyMessage(currency: string): string {
  return minorDigits(currency) > 0
    ? "Enter an amount like 5 or 5.50."
    : "Enter an amount like 500.";
}

/** Major-unit string → minor units. `allowZero` for one jar of a handover split. */
function money(currency: string, { allowZero = false } = {}) {
  const message = moneyMessage(currency);
  return z.string({ error: message }).transform((value, ctx) => {
    const minor = parseMoney(value, currency);
    if (minor === null) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    if (minor === 0 && !allowZero) {
      ctx.addIssue({ code: "custom", message: "Enter an amount more than 0." });
      return z.NEVER;
    }
    // Above the database cap the function would refuse it with no field to point at.
    if (minor > MAX_AMOUNT_MINOR) {
      const max = formatMoney(MAX_AMOUNT_MINOR, currency, { showMinor: "nonzero" });
      ctx.addIssue({ code: "custom", message: `Enter an amount up to ${max}.` });
      return z.NEVER;
    }
    return minor;
  });
}

const isoDate = z
  .string({ error: "Pick a date." })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "Pick a date.");

/** ISO dates compare correctly as strings. */
const withinYear = (today: string) => (value: string) => value <= addDays(today, MAX_DAYS_AHEAD);

/** Today up to a year ahead. */
const dateFrom = (today: string) =>
  isoDate
    .refine((value) => value >= today, "Pick today or a later date.")
    .refine(withinYear(today), "Pick a date within a year.");

/** Optional plain text for the child (gift note, pause message): trimmed, blank → null. */
const childText = z
  .string()
  .trim()
  .max(MAX_TEXT, `Keep it to ${MAX_TEXT} characters.`)
  .optional()
  .transform((value) => (value ? value : null));

const frequency = z.enum(frequencies, { error: "Choose how often." });

export const idSchema = z.object({ id: z.uuid("We couldn't find that.") });

/** Route params of the handover page: `/handover/[kind]/[id]`. */
export const handoverParamsSchema = z.object({
  kind: z.enum(["allowance", "gift"]),
  id: z.uuid(),
});

export const allowanceSchema = (currency: string, today: string) =>
  z
    .object({
      childId: z.uuid(),
      amount: money(currency),
      frequency,
      firstOn: dateFrom(today),
    })
    .transform(({ amount, ...rest }) => ({ ...rest, amountMinor: amount }));

/** Change screen: same fields, the date is "Next one on" (the new anchor). */
export const changeAllowanceSchema = (currency: string, today: string) =>
  z
    .object({
      scheduleId: z.uuid(),
      amount: money(currency),
      frequency,
      nextOn: dateFrom(today),
    })
    .transform(({ amount, ...rest }) => ({ ...rest, amountMinor: amount }));

/** `through` blank = until a parent resumes it. */
export const pauseSchema = (today: string) =>
  z.object({
    scheduleId: z.uuid(),
    through: z
      .preprocess((value) => (value === "" ? undefined : value), dateFrom(today).optional())
      .transform((value) => value ?? null),
    message: childText,
  });

export const giftSchema = (currency: string, today: string) =>
  z
    .object({
      childId: z.uuid(),
      amount: money(currency),
      giveOn: dateFrom(today),
      note: childText,
    })
    .transform(({ amount, ...rest }) => ({ ...rest, amountMinor: amount }));

/**
 * Editing may keep a give-on date that is already past (a due gift), so the date has no lower
 * bound here; `updateGift` rejects a changed date before today.
 */
export const updateGiftSchema = (currency: string, today: string) =>
  z
    .object({
      giftId: z.uuid(),
      amount: money(currency),
      giveOn: isoDate.refine(withinYear(today), "Pick a date within a year."),
      note: childText,
    })
    .transform(({ amount, ...rest }) => ({ ...rest, amountMinor: amount }));

/** The idempotency key is made once per form mount (`crypto.randomUUID()`), sent hidden. */
export const handoverSchema = (currency: string) =>
  z
    .object({
      kind: z.enum(["allowance", "gift"]),
      id: z.uuid("We couldn't find that."),
      cash: money(currency, { allowZero: true }),
      saved: money(currency, { allowZero: true }),
      idempotencyKey: z.uuid("Please reload the page and try again."),
    })
    .refine((value) => value.cash + value.saved > 0, {
      message: "Enter what you handed over.",
      path: ["cash"],
    })
    .transform(({ cash, saved, ...rest }) => ({ ...rest, cashMinor: cash, savedMinor: saved }));

export type AllowanceInput = z.infer<ReturnType<typeof allowanceSchema>>;
export type ChangeAllowanceInput = z.infer<ReturnType<typeof changeAllowanceSchema>>;
export type PauseInput = z.infer<ReturnType<typeof pauseSchema>>;
export type GiftInput = z.infer<ReturnType<typeof giftSchema>>;
export type UpdateGiftInput = z.infer<ReturnType<typeof updateGiftSchema>>;
export type HandoverInput = z.infer<ReturnType<typeof handoverSchema>>;
