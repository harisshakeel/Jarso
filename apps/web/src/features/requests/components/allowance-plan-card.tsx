"use client";

import { type AllowancePlan, allowancePlanCopy, allowancePlanLine } from "@jarso/core/guide";
import { type DepositResult, depositMessage } from "@jarso/core/requests";
import { useId, useState } from "react";
import { CoachSays, coachIdFor } from "@/components/brand";
import { FormError } from "@/components/form";
import { Button, Card, CardContent } from "@/components/ui";
import { newId, useOnlineActionState } from "@/features/offline";
import { formatMoney } from "@/lib";
import { acceptAllowancePlanAction, dismissAllowancePlanAction } from "../server/actions";

/** The Home's coach is the one riding the jar graph, so Home keeps one coach (design.md §7). */
const HOME_COACH_KEY = "jar-graph";

type AllowancePlanCardProps = {
  /** Today's handed-over allowance the plan is for. */
  occurrenceId: string;
  /** The split worked out in code, or null when there is nothing (left) to propose. */
  plan: AllowancePlan | null;
  /** The child already took or dismissed the plan: only a choice made on this screen shows. */
  decided: boolean;
  /** The active goal's name when the plan is for it. */
  goalName: string | null;
  currency: string;
  /** The parent set jar moves to "just tell me": the move happens at once, with a note. */
  movesWithoutAsking: boolean;
};

/**
 * "Jarso's plan for today's pocket money" (demo 3): on the day an allowance lands, the Home's
 * coach proposes how much of the Spend part to tuck into Save. "Do it" is an ordinary put-in of
 * the app's own figure, so the parent's ask/notify setting applies and the jar shelf flies the
 * coins (with their sound) once the money has moved. "Not today" hides the card for this
 * allowance. The figures come from code; no model is involved.
 */
export function AllowancePlanCard({
  occurrenceId,
  plan,
  decided,
  goalName,
  currency,
  movesWithoutAsking,
}: AllowancePlanCardProps) {
  const titleId = useId();
  const [idempotencyKey] = useState(newId);
  const [accepted, acceptAction, accepting, acceptSubmit, ready] =
    useOnlineActionState(acceptAllowancePlanAction);
  const [dismissed, dismissAction, dismissing, dismissSubmit] = useOnlineActionState(
    dismissAllowancePlanAction,
  );
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const coach = coachIdFor(HOME_COACH_KEY);

  const result: DepositResult | null =
    accepted?.ok && accepted.data.status !== "over_available" ? accepted.data : null;

  if (dismissed?.ok) return null;

  if (result) {
    const moved = result.status === "confirmed" || result.status === "done";
    return (
      <section aria-labelledby={titleId}>
        <Card className="rise-in shadow-raised">
          <CardContent className="grid gap-3">
            <h2 id={titleId} className="font-bold text-h3">
              {allowancePlanCopy.title}
            </h2>
            <div className="relative">
              {moved ? (
                <span
                  aria-hidden
                  data-coin-drop
                  className="pointer-events-none absolute top-0 left-6 hidden size-5 rounded-full border-2 border-teal-800 bg-gold motion-safe:block motion-safe:animate-[coin-drop_700ms_var(--ease-brand)_both]"
                />
              ) : null}
              <CoachSays
                coach={coach}
                size="sm"
                says={<span role="status">{depositMessage(result, currency)}</span>}
              />
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (decided || !plan) return null;

  const overAvailable =
    accepted?.ok && accepted.data.status === "over_available"
      ? depositMessage(accepted.data, currency)
      : undefined;
  const error =
    accepted && !accepted.ok
      ? accepted.error
      : dismissed && !dismissed.ok
        ? dismissed.error
        : undefined;
  const total = plan.saveMinor + plan.spendMinor;
  const savePercent = total > 0 ? Math.round((plan.saveMinor / total) * 100) : 0;

  return (
    <section aria-labelledby={titleId}>
      <Card className="rise-in shadow-raised">
        <CardContent className="grid gap-4">
          <h2 id={titleId} className="font-bold text-h3">
            {allowancePlanCopy.title}
          </h2>
          <CoachSays coach={coach} size="sm" says={allowancePlanLine(plan, money, goalName)} />
          {/* The split as a picture: Save's share in gold, Spend's in teal. The line says it in words. */}
          <div aria-hidden className="flex h-3 overflow-hidden rounded-full bg-muted">
            <span className="bg-gold" style={{ width: `${savePercent}%` }} />
            <span className="flex-1 bg-primary/60" />
          </div>
          <p className="text-ink-2">
            {movesWithoutAsking ? allowancePlanCopy.parentTold : allowancePlanCopy.parentConfirms}
          </p>
          <FormError error={error} message={overAvailable} />
          <div className="flex flex-wrap gap-3">
            <form action={acceptAction} onSubmit={acceptSubmit}>
              <input type="hidden" name="occurrenceId" value={occurrenceId} />
              <input type="hidden" name="amountMinor" value={plan.saveMinor} />
              <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
              <Button type="submit" size="lg" loading={accepting} disabled={!ready || dismissing}>
                {allowancePlanCopy.doIt}
              </Button>
            </form>
            <form action={dismissAction} onSubmit={dismissSubmit}>
              <input type="hidden" name="occurrenceId" value={occurrenceId} />
              <Button
                type="submit"
                size="lg"
                variant="ghost"
                loading={dismissing}
                disabled={!ready || accepting}
              >
                {allowancePlanCopy.notToday}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
