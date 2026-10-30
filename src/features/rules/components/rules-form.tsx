import { Card, CardContent } from "@/components/ui";
import { summarise } from "../describe";
import type { ChildRules, Period, RuleKind } from "../types";
import { OverspendSwitch } from "./overspend-switch";
import { RuleRow } from "./rule-row";

const SPEND_PERIODS: Period[] = ["item", "week", "month"];

type RulesFormProps = {
  childId: string;
  nickname: string;
  currency: string;
  rules: ChildRules;
};

/** One line on what the limits do: they send a note, they never block. */
function spendingSummary(rules: ChildRules, nickname: string): string {
  const active = rules.rules.some((rule) => rule.kind === "spend_limit");
  return active
    ? `You'll get a note when ${nickname} goes over these. ${nickname} can still record it.`
    : "No spending limits yet";
}

/** A few rows of one kind of rule, one per period, under a small heading. */
function RuleGroup({
  kind,
  childId,
  nickname,
  currency,
  rules,
}: {
  kind: RuleKind;
  childId: string;
  nickname: string;
  currency: string;
  rules: ChildRules;
}) {
  return (
    <div className="grid gap-4">
      {SPEND_PERIODS.map((period) => (
        <RuleRow
          key={period}
          childId={childId}
          nickname={nickname}
          currency={currency}
          kind={kind}
          period={period}
          rule={rules.rules.find((r) => r.kind === kind && r.period === period)}
        />
      ))}
    </div>
  );
}

/** The money rules for a child: spending, taking money out of Save, putting money in. */
export function RulesForm({ childId, nickname, currency, rules }: RulesFormProps) {
  return (
    <Card className="rise-in">
      <CardContent className="grid gap-6">
        <section aria-labelledby="spending-heading" className="grid gap-4">
          <h2 id="spending-heading" className="text-h3">
            Spending
          </h2>
          <p className="text-ink-2">{spendingSummary(rules, nickname)}</p>
          {SPEND_PERIODS.map((period) => (
            <RuleRow
              key={period}
              childId={childId}
              nickname={nickname}
              currency={currency}
              kind="spend_limit"
              period={period}
              rule={rules.rules.find((r) => r.kind === "spend_limit" && r.period === period)}
            />
          ))}
          <OverspendSwitch
            childId={childId}
            nickname={nickname}
            allowed={rules.allowNegativeSpend}
          />
        </section>
        <section aria-labelledby="take-out-heading" className="grid gap-4">
          <h2 id="take-out-heading" className="text-h3">
            Taking money out of Save
          </h2>
          <p className="text-ink-2">{summarise(rules.rules, "withdrawal", currency)}</p>
          <RuleGroup
            kind="withdrawal_cap"
            childId={childId}
            nickname={nickname}
            currency={currency}
            rules={rules}
          />
          <RuleGroup
            kind="withdrawal_auto_approve"
            childId={childId}
            nickname={nickname}
            currency={currency}
            rules={rules}
          />
        </section>
        <section aria-labelledby="put-in-heading" className="grid gap-4">
          <h2 id="put-in-heading" className="text-h3">
            Putting money into Save
          </h2>
          <p className="text-ink-2">{summarise(rules.rules, "deposit", currency)}</p>
          <RuleGroup
            kind="deposit_auto_confirm"
            childId={childId}
            nickname={nickname}
            currency={currency}
            rules={rules}
          />
          <p className="text-ink-2 text-sm">Deposits will count before you get the cash</p>
        </section>
      </CardContent>
    </Card>
  );
}
