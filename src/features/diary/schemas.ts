import { z } from "zod";
import { formatMoney, MAX_AMOUNT_MINOR, minorDigits, parseMoney } from "@/lib";

const MAX_LABEL = 60;

function money(currency: string) {
  const message =
    minorDigits(currency) > 0 ? "Enter an amount like 5 or 5.50." : "Enter an amount like 500.";
  return z.string({ error: message }).transform((value, ctx) => {
    const minor = parseMoney(value, currency);
    if (minor === null) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    if (minor === 0) {
      ctx.addIssue({ code: "custom", message: "Enter an amount more than 0." });
      return z.NEVER;
    }
    if (minor > MAX_AMOUNT_MINOR) {
      const max = formatMoney(MAX_AMOUNT_MINOR, currency, { showMinor: "nonzero" });
      ctx.addIssue({ code: "custom", message: `Enter an amount up to ${max}.` });
      return z.NEVER;
    }
    return minor;
  });
}

/** What the child spent. The key makes a double tap record once. */
export const purchaseSchema = (currency: string) =>
  z
    .object({
      amount: money(currency),
      label: z
        .string()
        .trim()
        .max(MAX_LABEL, `Keep it to ${MAX_LABEL} characters.`)
        .optional()
        .transform((value) => (value ? value : undefined)),
      idempotencyKey: z.uuid(),
    })
    .transform(({ amount, ...rest }) => ({ ...rest, amountMinor: amount }));

export const undoSchema = z.object({ entryId: z.uuid("We couldn't find that.") });
