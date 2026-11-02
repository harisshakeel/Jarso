import { z } from "zod";
import { moneySchema } from "@/lib";
import { periods, ruleKinds } from "./types";

/** Set or clear one rule. An empty amount switches it off. */
export const setRuleSchema = (currency: string) =>
  z
    .object({
      childId: z.uuid(),
      kind: z.enum(ruleKinds, { error: "Choose a rule." }),
      period: z.enum(periods, { error: "Choose how often." }),
      amount: moneySchema(currency, { allowEmpty: true }),
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
