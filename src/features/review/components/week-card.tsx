import { ArrowRightIcon, CalendarCheckIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { skillLevelLabels } from "@/features/learning";
import { formatMoney } from "@/lib";
import type { WeeklyReview } from "../types";

type WeekCardProps = {
  review: WeeklyReview;
  currency: string;
  /** Full page: every line. Compact (Home): the headline figures and one link. */
  compact?: boolean;
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
 * The weekly review (FR11): money received, spent, saved and still due; the goal; one decision
 * and its effect; a skill shown and one worth another look; a fresh question. Praise goes to
 * thinking, never to the amount (docs/roadmap.md, gamification rules).
 */
export function WeekCard({ review, currency, compact = false }: WeekCardProps) {
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const { money: week, goal, decision, understood, practise, question } = review;
  const saved = week.savedMinor;
  return (
    <Card className="shadow-raised">
      <CardContent>
        <section aria-labelledby="week-heading" className="grid gap-4">
          <div className="grid gap-1">
            <p className="eyebrow flex items-center gap-2">
              <CalendarCheckIcon aria-hidden className="size-4" />
              Your week
            </p>
            <h2 id="week-heading" className="text-balance text-h3">
              {day(week.weekStart)} to {day(week.weekEnd)}
            </h2>
          </div>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label="Received" value={money(week.receivedMinor)} />
            <Figure label="Spent" value={money(week.spentMinor)} />
            <Figure
              label={saved < 0 ? "Out of Save" : "Into Save"}
              value={money(Math.abs(saved))}
            />
            <Figure label="Still due" value={money(week.stillDueMinor)} />
          </dl>

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
                <p className="text-ink-2">No money moved this week. The plan stays as it was.</p>
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
                  <p className="text-ink-2">
                    Worth another look: {practise.label.toLowerCase()} (
                    {skillLevelLabels[practise.level]}).
                  </p>
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

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-ink-2 text-sm">{label}</dt>
      <dd className="money font-bold">{value}</dd>
    </div>
  );
}
