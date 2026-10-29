import { z } from "zod";
import { formatMoney, MAX_AMOUNT_MINOR, minorDigits, parseMoney } from "@/lib";
import { periods, ruleKinds } from "./types";

/** A major-unit string parsed with the family currency; empty means the rule is off (null). */
function optionalMoney(currency: string) {
  const message =
    minorDigits(currency) > 0 ? "Enter an amount like 5 or 5.50." : "Enter an amount like 500.";
  return z.string({ error: message }).transform((value, ctx) => {
    if (value.trim() === "") return null;
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

/** Set or clear one rule. An empty amount switches it off. */
export const setRuleSchema = (currency: string) =>
  z
    .object({
      childId: z.uuid(),
      kind: z.enum(ruleKinds, { error: "Choose a rule." }),
      period: z.enum(periods, { error: "Choose how often." }),
      amount: optionalMoney(currency),
    })
    .transform(({ amount, ...rest }) => ({ ...rest, amountMinor: amount }));

export const overspendSchema = z.object({
  childId: z.uuid(),
  // Forms send "on"/"true" for a ticked box; z.coerce.boolean would make "false" true.
  allowed: z.preprocess(
    (value) => value === true || value === "true" || value === "on",
    z.boolean(),
  ),
});
