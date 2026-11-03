"use client";

import type { MoneyRule, Period, RuleKind } from "@jarso/core/rules";
import { describeRule } from "@jarso/core/rules";
import { PlusIcon } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { AmountField, ChoiceChips, FormError } from "@/components/form";
import { Button } from "@/components/ui";
import { runOnline } from "@/features/offline";
import { parseMoney, toMajorString } from "@/lib";
import { setRuleAction } from "../server/actions";

export const PERIOD_LABEL: Record<Period, string> = {
  item: "Each time",
  week: "A week",
  month: "A month",
};

const PERIODS: Period[] = ["item", "week", "month"];

type RuleGroupProps = {
  childId: string;
  nickname: string;
  currency: string;
  kind: RuleKind;
  /** The saved rules of this kind. */
  rules: MoneyRule[];
  /** The button that starts a new rule, e.g. "Add a spending limit". */
  addLabel: string;
  /** What this kind means, shown when there is no rule yet. */
  emptyLine: string;
};

type Draft = { period: Period; amount: string };

/**
 * One kind of rule as the sentences it makes (design.md §10): the rules that exist, each with
 * Change and Remove, and one button to add another. Nothing is a switch; a rule is on because
 * it is there. The server stores an empty amount as "no rule".
 */
export function RuleGroup({
  childId,
  nickname,
  currency,
  kind,
  rules: initial,
  addLabel,
  emptyLine,
}: RuleGroupProps) {
  const [rules, setRules] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<Period | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ code: string; message: string }>();
  const [fieldError, setFieldError] = useState<string>();
  const amountId = useId();

  const freePeriods = PERIODS.filter((period) => !rules.some((rule) => rule.period === period));

  function send(period: Period, amount: string, onOk: (amountMinor: number | null) => void) {
    setError(undefined);
    setFieldError(undefined);
    start(async () => {
      const result = await runOnline(() => setRuleAction(null, { childId, kind, period, amount }));
      // Updates after an await leave the transition unless wrapped again, so they commit with
      // `pending` turning false.
      start(() => {
        if (result.ok) return onOk(parseMoney(amount, currency));
        const first = result.error.fieldErrors?.amount?.[0];
        if (first) setFieldError(first);
        else setError(result.error);
      });
    });
  }

  function save(event: React.FormEvent, period: Period, amount: string) {
    event.preventDefault();
    send(period, amount, (amountMinor) => {
      setRules((current) => {
        const rest = current.filter((rule) => rule.period !== period);
        return amountMinor === null
          ? rest
          : [...rest, { kind, period, amountMinor }].sort(
              (a, b) => PERIODS.indexOf(a.period) - PERIODS.indexOf(b.period),
            );
      });
      setDraft(null);
      setEditing(null);
      toast.success("Saved");
    });
  }

  function remove(period: Period) {
    send(period, "", () => {
      setRules((current) => current.filter((rule) => rule.period !== period));
      toast.success("Rule removed");
    });
  }

  return (
    <div className="grid gap-2">
      {rules.length === 0 && !draft ? <p className="text-ink-2">{emptyLine}</p> : null}
      {rules.length > 0 ? (
        <ul className="grid gap-2">
          {rules.map((rule) => (
            <li
              key={rule.period}
              className="@container grid gap-2 rounded-xl bg-muted/60 px-4 py-2.5"
            >
              {editing === rule.period ? (
                <AmountForm
                  id={`${amountId}-${rule.period}`}
                  currency={currency}
                  initial={toMajorString(rule.amountMinor, currency)}
                  pending={pending}
                  fieldError={fieldError}
                  onSubmit={(event, amount) => save(event, rule.period, amount)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex flex-col gap-1 @lg:flex-row @lg:items-center @lg:justify-between @lg:gap-3">
                  <p className="font-semibold">{describeRule(rule, nickname, currency)}</p>
                  <span className="-ml-3 flex shrink-0 gap-1 @lg:-mr-2 @lg:ml-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Change: ${describeRule(rule, nickname, currency)}`}
                      disabled={pending}
                      onClick={() => {
                        setDraft(null);
                        setEditing(rule.period);
                      }}
                    >
                      Change
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove: ${describeRule(rule, nickname, currency)}`}
                      loading={pending}
                      onClick={() => remove(rule.period)}
                    >
                      Remove
                    </Button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {draft ? (
        <form
          onSubmit={(event) => save(event, draft.period, draft.amount)}
          className="grid gap-3 rounded-xl border border-hairline bg-card p-4"
          noValidate
        >
          <ChoiceChips
            name={`${kind}-period`}
            legend="How often?"
            options={freePeriods.map((period) => ({ value: period, label: PERIOD_LABEL[period] }))}
            value={draft.period}
            onValueChange={(value) => setDraft({ ...draft, period: value as Period })}
          />
          <AmountField
            id={`${amountId}-new`}
            label="Amount"
            currency={currency}
            value={draft.amount}
            onValueChange={(amount) => setDraft({ ...draft, amount })}
            errors={fieldError ? [fieldError] : undefined}
          />
          <div className="flex gap-2">
            <Button type="submit" size="lg" loading={pending}>
              Save
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : freePeriods.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-auto min-h-11 w-fit max-w-full whitespace-normal py-2 text-left"
          onClick={() => {
            setEditing(null);
            setFieldError(undefined);
            setDraft({ period: freePeriods[0] ?? "week", amount: "" });
          }}
        >
          <PlusIcon aria-hidden className="size-5" />
          {addLabel}
        </Button>
      ) : null}
      <FormError error={error} />
    </div>
  );
}

function AmountForm({
  id,
  currency,
  initial,
  pending,
  fieldError,
  onSubmit,
  onCancel,
}: {
  id: string;
  currency: string;
  initial: string;
  pending: boolean;
  fieldError?: string;
  onSubmit: (event: React.FormEvent, amount: string) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(initial);
  return (
    <form onSubmit={(event) => onSubmit(event, amount)} className="grid gap-3" noValidate>
      <AmountField
        id={id}
        label="Amount"
        currency={currency}
        value={amount}
        onValueChange={setAmount}
        errors={fieldError ? [fieldError] : undefined}
      />
      <div className="flex gap-2">
        <Button type="submit" size="lg" loading={pending}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
