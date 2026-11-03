import type { ChildRules, RuleKind } from "@jarso/core/rules";
import { summarise } from "@jarso/core/rules";
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

/** One line on what the limits do: they send a note, they never block. */
function spendingSummary(rules: ChildRules, nickname: string): string {
  const active = rules.rules.some((rule) => rule.kind === "spend_limit");
  return active
    ? `You'll get a note when ${nickname} goes over these. ${nickname} can still record it.`
    : "No spending limits yet";
}

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
        title="Spending"
        now={spendingSummary(rules, nickname)}
        icon={ShoppingBagIcon}
        tone="teal"
        className="md:col-start-1 md:row-start-1 xl:row-span-2"
      >
        <RuleGroup
          {...shared}
          kind="spend_limit"
          rules={of("spend_limit")}
          addLabel="Add a spending limit"
          emptyLine={`Add one to get a note when ${nickname} spends more than an amount.`}
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
        title="Moving money between jars"
        icon={ArrowLeftRightIcon}
        tone="neutral"
        className="md:col-start-1 md:row-start-2 xl:col-start-3 xl:row-start-1"
      >
        <JarMovesChoice childId={childId} nickname={nickname} mode={rules.jarMovesApproval} />
      </RuleCard>
      <RuleCard
        id="take-out-heading"
        title="Taking money out of Save"
        now={
          notify
            ? "Take-outs are recorded at once and you get a note; the limits below still hold."
            : summarise(rules.rules, "withdrawal", currency)
        }
        icon={HandCoinsIcon}
        tone="gold"
        className="md:col-start-2 md:row-start-1 xl:row-span-2"
      >
        <CardPart id="cap-heading" title={`How much can ${nickname} take out?`}>
          <RuleGroup
            {...shared}
            kind="withdrawal_cap"
            rules={of("withdrawal_cap")}
            addLabel="Add a limit"
            emptyLine="No limit: any amount can be asked for."
          />
        </CardPart>
        <CardPart id="auto-heading" title={`What can ${nickname} take out without asking?`}>
          <RuleGroup
            {...shared}
            kind="withdrawal_auto_approve"
            rules={of("withdrawal_auto_approve")}
            addLabel={`Let ${nickname} take out without asking`}
            emptyLine="Nothing yet: every take-out waits for your yes."
          />
        </CardPart>
      </RuleCard>
      <RuleCard
        id="put-in-heading"
        title="Putting money into Save"
        now={
          notify
            ? "Put-ins count in Save at once and you get a note."
            : summarise(rules.rules, "deposit", currency)
        }
        icon={PiggyBankIcon}
        tone="gold"
        className="md:col-start-2 md:row-start-2 xl:col-start-3"
      >
        <RuleGroup
          {...shared}
          kind="deposit_auto_confirm"
          rules={of("deposit_auto_confirm")}
          addLabel="Let put-ins count before I confirm"
          emptyLine={`Every put-in waits until you say you have the cash from ${nickname}.`}
        />
        <p className="text-muted-foreground text-sm">
          Money {nickname} puts in under a rule counts in Save straight away, before you have the
          cash.
        </p>
      </RuleCard>
    </div>
  );
}
