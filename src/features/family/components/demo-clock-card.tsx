"use client";

import { ClockIcon } from "lucide-react";
import { type CSSProperties, startTransition, useActionState, useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { type ActionState, formatIsoDate, idle } from "@/lib";
import { advanceFamilyClockAction } from "../server/actions";
import type { ClockAdvance } from "../types";

/** The moves on offer; a month is 30 days. */
export const demoClockSteps = [
  { days: 1, label: "+1 day" },
  { days: 7, label: "+7 days" },
  { days: 30, label: "+1 month" },
] as const;

const longDate = (isoDate: string) =>
  formatIsoDate(isoDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

type DemoClockCardProps = {
  /** The family's today (ISO `YYYY-MM-DD`), already moved by the demo clock. */
  today: string;
  className?: string;
  style?: CSSProperties;
};

/**
 * Demo clock (D11), for demo families only: moves the family's days forward so an allowance
 * falls due and reminders arrive without waiting. Forward only. Shown only when the deployment
 * has FEATURE_DEMO_CLOCK on.
 */
export function DemoClockCard({ today, className, style }: DemoClockCardProps) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [state, dispatch, pending] = useActionState(
    async (prev: ActionState<ClockAdvance>, days: number) => {
      const result = await advanceFamilyClockAction(prev, { days });
      if (result.ok) toast.success(`It's now ${longDate(result.data.today)}`);
      return result;
    },
    idle,
  );

  function move(days: number) {
    setChosen(days);
    startTransition(() => dispatch(days));
  }

  return (
    <Card className={className} style={style}>
      <CardHeader>
        <p className="eyebrow">For demos</p>
        <CardTitle className="text-h2">Demo clock</CardTitle>
        <CardDescription>
          Move your family's days forward to see allowances fall due and reminders arrive. The clock
          only goes forward.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="flex items-center gap-2 font-semibold">
          <ClockIcon aria-hidden />
          <span>
            Today in Jarso: <time dateTime={today}>{longDate(today)}</time>
          </span>
        </p>
        <div className="flex flex-wrap gap-3">
          {demoClockSteps.map((step) => (
            <Button
              key={step.days}
              type="button"
              variant="outline"
              size="lg"
              disabled={pending}
              loading={pending && chosen === step.days}
              onClick={() => move(step.days)}
            >
              {step.label}
            </Button>
          ))}
        </div>
        <FormError error={state?.ok === false ? state.error : undefined} />
      </CardContent>
    </Card>
  );
}
