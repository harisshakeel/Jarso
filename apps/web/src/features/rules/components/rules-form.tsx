import type { ChildRules, RuleKind } from "@jarso/core/rules";
import { summarise } from "@jarso/core/rules";
import { Card, CardContent } from "@/components/ui";
import { OverspendSwitch } from "./overspend-switch";
import { RuleGroup } from "./rule-group";

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

/**
 * The money rules for a child as sentences, grouped by what they are about: spending, taking
 * money out of Save, putting money in. Each group lists the rules that exist and offers one
 * button to add another, so an empty page is three friendly sentences, not a grid of switches.
 */
export function RulesForm({ childId, nickname, currency, rules }: RulesFormProps) {
  const of = (kind: RuleKind) => rules.rules.filter((rule) => rule.kind === kind);
  const shared = { childId, nickname, currency };
  return (
    <Card className="rise-in">
      <CardContent className="grid gap-8">
        <fieldset aria-labelledby="spending-heading" className="grid min-w-0 gap-4">
          <h2 id="spending-heading" className="text-h3">
            Spending
          </h2>
          <p className="text-ink-2">{spendingSummary(rules, nickname)}</p>
          <RuleGroup
            {...shared}
            kind="spend_limit"
            rules={of("spend_limit")}
            addLabel="Add a spending limit"
            emptyLine={`Add one to get a note when ${nickname} spends more than an amount.`}
          />
          <OverspendSwitch
            childId={childId}
            nickname={nickname}
            allowed={rules.allowNegativeSpend}
          />
        </fieldset>
        <fieldset aria-labelledby="take-out-heading" className="grid min-w-0 gap-4">
          <h2 id="take-out-heading" className="text-h3">
            Taking money out of Save
          </h2>
          <p className="text-ink-2">{summarise(rules.rules, "withdrawal", currency)}</p>
          <section aria-labelledby="cap-heading" className="grid gap-3">
            <h3 id="cap-heading" className="font-semibold">
              How much can {nickname} take out?
            </h3>
            <RuleGroup
              {...shared}
              kind="withdrawal_cap"
              rules={of("withdrawal_cap")}
              addLabel="Add a limit"
              emptyLine="No limit: any amount can be asked for."
            />
          </section>
          <section aria-labelledby="auto-heading" className="grid gap-3">
            <h3 id="auto-heading" className="font-semibold">
              What can {nickname} take out without asking?
            </h3>
            <RuleGroup
              {...shared}
              kind="withdrawal_auto_approve"
              rules={of("withdrawal_auto_approve")}
              addLabel={`Let ${nickname} take out without asking`}
              emptyLine="Nothing yet: every take-out waits for your yes."
            />
          </section>
        </fieldset>
        <fieldset aria-labelledby="put-in-heading" className="grid min-w-0 gap-4">
          <h2 id="put-in-heading" className="text-h3">
            Putting money into Save
          </h2>
          <p className="text-ink-2">{summarise(rules.rules, "deposit", currency)}</p>
          <RuleGroup
            {...shared}
            kind="deposit_auto_confirm"
            rules={of("deposit_auto_confirm")}
            addLabel="Let put-ins count before I confirm"
            emptyLine={`Every put-in waits until you say you have the cash from ${nickname}.`}
          />
          <p className="text-ink-2">
            Money {nickname} puts in under a rule counts in Save straight away, before you have the
            cash.
          </p>
        </fieldset>
      </CardContent>
    </Card>
  );
}
