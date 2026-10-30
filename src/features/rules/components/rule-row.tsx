"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AmountField, FormError } from "@/components/form";
import { Button, Switch } from "@/components/ui";
import { runOnline } from "@/features/offline";
import { parseMoney, toMajorString } from "@/lib";
import { describeRule } from "../describe";
import { setRuleAction } from "../server/actions";
import type { MoneyRule, Period, RuleKind } from "../types";

const PERIOD_LABEL: Record<Period, string> = {
  item: "Per time",
  week: "A week",
  month: "A month",
};

type RuleRowProps = {
  childId: string;
  nickname: string;
  currency: string;
  kind: RuleKind;
  period: Period;
  /** The saved rule, if one is on. */
  rule?: MoneyRule;
};

/** One rule: a switch, an amount and the sentence it makes. Switching off clears the rule. */
export function RuleRow({ childId, nickname, currency, kind, period, rule }: RuleRowProps) {
  const [saved, setSaved] = useState(rule);
  const [on, setOn] = useState(Boolean(rule));
  const [amount, setAmount] = useState(rule ? toMajorString(rule.amountMinor, currency) : "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [calm, setCalm] = useState(false);
  const [fieldError, setFieldError] = useState<string>();
  const id = `${kind}-${period}`;

  function send(value: string, onOk: () => void) {
    setError(undefined);
    setFieldError(undefined);
    start(async () => {
      const result = await runOnline(() =>
        setRuleAction(null, { childId, kind, period, amount: value }),
      );
      if (result.ok) return onOk();
      const first = result.error.fieldErrors?.amount?.[0];
      if (first) setFieldError(first);
      else {
        setError(result.error.message);
        setCalm(result.error.code === "UNAVAILABLE");
      }
    });
  }

  function toggle(next: boolean) {
    if (next) return setOn(true);
    if (!saved) return setOn(false);
    send("", () => {
      setOn(false);
      setSaved(undefined);
      setAmount("");
    });
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    send(amount, () => {
      // The server stored this, or cleared the rule when the amount was blank.
      const amountMinor = parseMoney(amount, currency);
      setSaved(amountMinor === null ? undefined : { kind, period, amountMinor });
      if (amountMinor === null) setOn(false);
      toast.success("Saved");
    });
  }

  const sentence = saved
    ? describeRule(saved, nickname, currency)
    : on
      ? "Set an amount, then Save"
      : `${PERIOD_LABEL[period]}: no limit`;

  return (
    <form onSubmit={save} className="grid gap-3" noValidate>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={id} className="font-semibold">
          {PERIOD_LABEL[period]}
        </label>
        <Switch id={id} checked={on} disabled={pending} onCheckedChange={toggle} />
      </div>
      <p className="text-ink-2 text-sm">{sentence}</p>
      {on ? (
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <AmountField
              id={`${id}-amount`}
              label={`${PERIOD_LABEL[period]} limit`}
              currency={currency}
              value={amount}
              onValueChange={setAmount}
              errors={fieldError ? [fieldError] : undefined}
            />
          </div>
          <Button type="submit" variant="outline" size="lg" loading={pending}>
            Save
          </Button>
        </div>
      ) : null}
      <FormError message={error} calm={calm} />
    </form>
  );
}
