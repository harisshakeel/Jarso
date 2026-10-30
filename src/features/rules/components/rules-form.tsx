import { Card, CardContent } from "@/components/ui";
import type { ChildRules, Period } from "../types";
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

/** The Spending section of a child's money rules. */
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
      </CardContent>
    </Card>
  );
}
