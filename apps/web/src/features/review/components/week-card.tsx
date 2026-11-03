import type { WeeklyReview } from "@jarso/core/review";
import { weekDay as day, weekCopy, weekSentence } from "@jarso/core/review";
import { ArrowRightIcon, CalendarCheckIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { formatMoney } from "@/lib";

type WeekCardProps = {
  review: WeeklyReview;
  currency: string;
  /** Full page: every line. Compact (Home): the week in one sentence and one link. */
  compact?: boolean;
  /** The card's heading level: h1 on its own page, h2 inside Home. */
  titleAs?: "h1" | "h2";
};

export { weekSentence } from "@jarso/core/review";

/**
 * The weekly review (FR11): the week in a sentence; the goal; one decision and its effect; a
 * skill shown and one worth another look; a fresh question. Praise goes to thinking, never to
 * the amount (docs/roadmap.md, gamification rules).
 */
export function WeekCard({
  review,
  currency,
  compact = false,
  titleAs: Title = "h2",
}: WeekCardProps) {
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const { money: week, goal, topCategory, decision, understood, practise, question } = review;
  return (
    <Card className="shadow-raised">
      <CardContent>
        <section aria-labelledby="week-heading" className="grid gap-4">
          <div className="grid gap-1">
            <p className="eyebrow flex items-center gap-2">
              <CalendarCheckIcon aria-hidden className="size-4" />
              {weekCopy.range(day(week.weekStart), day(week.weekEnd))}
            </p>
            <Title id="week-heading" className="text-balance text-h2">
              {weekCopy.heading}
            </Title>
          </div>

          <p className="text-lg">{weekSentence(week, money)}</p>
          {topCategory ? (
            <p className="text-ink-2">{weekCopy.mostWentOn(topCategory.label)}</p>
          ) : null}
          {week.stillDueMinor > 0 ? (
            <p className="text-ink-2">{weekCopy.stillDue(money(week.stillDueMinor))}</p>
          ) : null}

          {goal.kind === "progress" ? (
            <p>
              {weekCopy.goalProgress(
                goal.emoji,
                goal.name,
                money(goal.countedMinor),
                money(goal.targetMinor),
              )}
              {goal.paymentsLeft !== null
                ? weekCopy.paymentsLeft(goal.paymentsLeft)
                : weekCopy.remaining(money(goal.remainingMinor))}
            </p>
          ) : goal.kind === "reached" ? (
            <p>{weekCopy.goalReached(goal.emoji, goal.name)}</p>
          ) : null}

          {compact ? (
            <Link
              href={routes.childWeek}
              className="inline-flex min-h-11 w-fit items-center gap-1 rounded-full font-semibold text-primary underline-offset-4 hover:underline"
            >
              {weekCopy.seeWhole}
              <ArrowRightIcon aria-hidden className="size-5" />
            </Link>
          ) : (
            <>
              {decision ? (
                <section
                  aria-labelledby="week-decision"
                  className="grid gap-1 rounded-xl bg-secondary p-4"
                >
                  <h3 id="week-decision" className="eyebrow">
                    {weekCopy.oneDecision}
                  </h3>
                  <p className="font-semibold">{decision.what}</p>
                  <p className="text-ink-2">{decision.effect}</p>
                </section>
              ) : (
                <p className="text-ink-2">{weekCopy.planSame}</p>
              )}

              <section aria-labelledby="week-skills" className="grid gap-2">
                <h3 id="week-skills" className="eyebrow">
                  {weekCopy.learning}
                </h3>
                {understood ? (
                  <p>
                    {weekCopy.showedYouCan}{" "}
                    <span className="font-semibold">{understood.label.toLowerCase()}</span>
                    {weekCopy.goodThinking}
                  </p>
                ) : null}
                {practise ? (
                  <p className="text-ink-2">
                    {weekCopy.worthAnotherLook(practise.label.toLowerCase())}
                  </p>
                ) : !understood ? (
                  <p className="text-ink-2">{weekCopy.firstSkill}</p>
                ) : null}
              </section>

              {question ? (
                <Link
                  href={routes.childWeekQuestion}
                  className="keycap inline-flex h-11 w-fit items-center gap-2 rounded-full bg-primary px-6 font-bold text-primary-foreground"
                >
                  {weekCopy.freshQuestion}
                  <ArrowRightIcon aria-hidden className="size-5" />
                </Link>
              ) : null}
            </>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
