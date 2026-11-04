import type { ChildRules, RuleKind } from "@jarso/core/rules";
import { rulesCopy, spendingSummary, summarise } from "@jarso/core/rules";
import {
  ArrowLeftRightIcon,
  HandCoinsIcon,
  type LucideIcon,
  PiggyBankIcon,
  ShoppingBagIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { type Tone, toneIcon } from "@/components/layout";
import { Card, CardContent } from "@/components/ui";
import { cn } from "@/lib";
import { JarMovesChoice } from "./jar-moves-choice";
import { OverspendSwitch } from "./overspend-switch";
import { RuleGroup } from "./rule-group";

type RulesFormProps = {
  childId: string;
  nickname: string;
  currency: string;
  rules: ChildRules;
};

/**
 * One rule area as a card: an icon and the title, what is set right now in plain words, then its
 * controls. The fieldset gives the area its group name. Compact padding: the parent area is dense.
 */
function RuleCard({
  id,
  title,
  now,
  icon: Icon,
  tone,
  className,
  children,
}: {
  id: string;
  title: string;
  now?: string;
  icon: LucideIcon;
  tone: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card size="sm" className={cn("rise-in", className)}>
      <CardContent>
        <fieldset aria-labelledby={id} className="grid min-w-0 content-start gap-2.5">
          <div className="flex items-center gap-2.5">
            <span
              className={cn("grid size-8 shrink-0 place-items-center rounded-full", toneIcon[tone])}
            >
              <Icon aria-hidden className="size-4.5" />
            </span>
            <h2 id={id} className="font-bold text-lg leading-snug">
              {title}
            </h2>
          </div>
          {now ? <p className="font-semibold">{now}</p> : null}
          {children}
        </fieldset>
      </CardContent>
    </Card>
  );
}

/** A titled part of a card (the two take-out questions), set off by a hairline. */
function CardPart({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-2 border-hairline border-t pt-3">
      <h3 id={id} className="font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * The money rules for a child, one card per area so a parent sees every rule at once: spending,
 * how jar moves work, taking money out of Save, putting money in. Each card says what is set now
 * and lists the rules that exist with one button to add another, so an empty page reads as
 * friendly sentences, not a grid of switches. Two columns from 768 px (Spending and jar moves on
 * the left, the two Save areas on the right); from 1280 px three, so the page fits one screen:
 * Spending, taking out, then jar moves above putting in.
 */
export function RulesForm({ childId, nickname, currency, rules }: RulesFormProps) {
  const of = (kind: RuleKind) => rules.rules.filter((rule) => rule.kind === kind);
  const shared = { childId, nickname, currency };
  const notify = rules.jarMovesApproval === "notify";
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <RuleCard
        id="spending-heading"
        title={rulesCopy.spending}
        now={spendingSummary(rules, nickname)}
        icon={ShoppingBagIcon}
        tone="teal"
        className="md:col-start-1 md:row-start-1 xl:row-span-2"
      >
        <RuleGroup
          {...shared}
          kind="spend_limit"
          rules={of("spend_limit")}
          addLabel={rulesCopy.addSpendLimit}
          emptyLine={rulesCopy.spendLimitEmpty(nickname)}
        />
        <div className="border-hairline border-t pt-3">
          <OverspendSwitch
            childId={childId}
            nickname={nickname}
            allowed={rules.allowNegativeSpend}
          />
        </div>
      </RuleCard>
      <RuleCard
        id="moves-heading"
        title={rulesCopy.moves}
        icon={ArrowLeftRightIcon}
        tone="neutral"
        className="md:col-start-1 md:row-start-2 xl:col-start-3 xl:row-start-1"
      >
        <JarMovesChoice childId={childId} nickname={nickname} mode={rules.jarMovesApproval} />
      </RuleCard>
      <RuleCard
        id="take-out-heading"
        title={rulesCopy.takeOut}
        now={notify ? rulesCopy.takeOutNotify : summarise(rules.rules, "withdrawal", currency)}
        icon={HandCoinsIcon}
        tone="gold"
        className="md:col-start-2 md:row-start-1 xl:row-span-2"
      >
        <CardPart id="cap-heading" title={rulesCopy.capTitle(nickname)}>
          <RuleGroup
            {...shared}
            kind="withdrawal_cap"
            rules={of("withdrawal_cap")}
            addLabel={rulesCopy.addCap}
            emptyLine={rulesCopy.capEmpty}
          />
        </CardPart>
        <CardPart id="auto-heading" title={rulesCopy.autoTitle(nickname)}>
          <RuleGroup
            {...shared}
            kind="withdrawal_auto_approve"
            rules={of("withdrawal_auto_approve")}
            addLabel={rulesCopy.addAuto(nickname)}
            emptyLine={rulesCopy.autoEmpty}
          />
        </CardPart>
      </RuleCard>
      <RuleCard
        id="put-in-heading"
        title={rulesCopy.putIn}
        now={notify ? rulesCopy.putInNotify : summarise(rules.rules, "deposit", currency)}
        icon={PiggyBankIcon}
        tone="gold"
        className="md:col-start-2 md:row-start-2 xl:col-start-3"
      >
        <RuleGroup
          {...shared}
          kind="deposit_auto_confirm"
          rules={of("deposit_auto_confirm")}
          addLabel={rulesCopy.addDeposit}
          emptyLine={rulesCopy.depositEmpty(nickname)}
        />
        <p className="text-muted-foreground text-sm">{rulesCopy.depositNote(nickname)}</p>
      </RuleCard>
    </div>
  );
}
