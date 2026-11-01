import { ArrowRightIcon, CalendarCheckIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { formatMoney } from "@/lib";
import type { WeeklyReview, WeekMoney } from "../types";

type WeekCardProps = {
  review: WeeklyReview;
  currency: string;
  /** Full page: every line. Compact (Home): the week in one sentence and one link. */
  compact?: boolean;
  /** The card's heading level: h1 on its own page, h2 inside Home. */
  titleAs?: "h1" | "h2";
};

/** "Fri 30 Oct" for the week's edges. Calendar days, so formatted in UTC. */
function day(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * The week's money as one sentence instead of a grid of figures (design.md §10): what came in,
 * what went out, what moved to Save. Nothing moved reads as a calm line, never four zeros.
 */
export function weekSentence(week: WeekMoney, money: (minor: number) => string): string {
  const parts: string[] = [];
  if (week.receivedMinor > 0) parts.push(`${money(week.receivedMinor)} came in`);
  if (week.spentMinor > 0) parts.push(`you spent ${money(week.spentMinor)}`);
  if (week.savedMinor > 0) parts.push(`${money(week.savedMinor)} went into Save`);
  if (week.savedMinor < 0) parts.push(`${money(-week.savedMinor)} came out of Save`);
  if (parts.length === 0) return "No money moved this week.";
  const last = parts.pop();
  const body = parts.length ? `${parts.join(", ")} and ${last}` : last;
  return `This week ${body}.`;
}

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
              {day(week.weekStart)} to {day(week.weekEnd)}
            </p>
            <Title id="week-heading" className="text-balance text-h2">
              Your week
            </Title>
          </div>

          <p className="text-lg">{weekSentence(week, money)}</p>
          {topCategory ? (
            <p className="text-ink-2">This week most went on {topCategory.label}.</p>
          ) : null}
          {week.stillDueMinor > 0 ? (
            <p className="text-ink-2">
              {money(week.stillDueMinor)} of allowance is still on its way from your parent.
            </p>
          ) : null}

          {goal.kind === "progress" ? (
            <p>
              {goal.emoji} {goal.name}: {money(goal.countedMinor)} of {money(goal.targetMinor)}.
              {goal.paymentsLeft !== null
                ? ` About ${goal.paymentsLeft} allowance${goal.paymentsLeft === 1 ? "" : "s"} to go.`
                : ` ${money(goal.remainingMinor)} to go.`}
            </p>
          ) : goal.kind === "reached" ? (
            <p>
              {goal.emoji} {goal.name}: saved up.
            </p>
          ) : null}

          {compact ? (
            <Link
              href={routes.childWeek}
              className="inline-flex min-h-11 w-fit items-center gap-1 rounded-full font-semibold text-primary underline-offset-4 hover:underline"
            >
              See your whole week
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
                    One decision
                  </h3>
                  <p className="font-semibold">{decision.what}</p>
                  <p className="text-ink-2">{decision.effect}</p>
                </section>
              ) : (
                <p className="text-ink-2">The plan stays as it was.</p>
              )}

              <section aria-labelledby="week-skills" className="grid gap-2">
                <h3 id="week-skills" className="eyebrow">
                  Learning
                </h3>
                {understood ? (
                  <p>
                    You showed you can{" "}
                    <span className="font-semibold">{understood.label.toLowerCase()}</span>. Good
                    thinking.
                  </p>
                ) : null}
                {practise ? (
                  <p className="text-ink-2">Worth another look: {practise.label.toLowerCase()}.</p>
                ) : !understood ? (
                  <p className="text-ink-2">Your first skill is one mission away.</p>
                ) : null}
              </section>

              {question ? (
                <Link
                  href={routes.childWeekQuestion}
                  className="keycap inline-flex h-11 w-fit items-center gap-2 rounded-full bg-primary px-6 font-bold text-primary-foreground"
                >
                  One fresh question
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
