"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  buttonVariants,
  Card,
  CardContent,
} from "@/components/ui";
import { routes } from "@/config";
import { runOnline } from "@/features/offline";
import { type ActionResult, formatMoney } from "@/lib";
import { cadenceAfterAmount, formatDay } from "../describe";
import { resumeAllowanceAction, stopAllowanceAction } from "../server/actions";
import type { Schedule } from "../types";
import { PauseSheet } from "./pause-sheet";

type AllowanceSummaryProps = {
  childId: string;
  nickname: string;
  currency: string;
  /** Family-local date, `YYYY-MM-DD`. */
  today: string;
  /** A running or paused schedule. */
  schedule: Schedule;
};

/** Amount, how often, next date and the parent's actions (spec §5.3). */
export function AllowanceSummary({
  childId,
  nickname,
  currency,
  today,
  schedule,
}: AllowanceSummaryProps) {
  const paused = schedule.status === "paused";
  const next = schedule.nextDueOn;
  return (
    <Card className="rise-in shadow-raised">
      <CardContent className="grid gap-6">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="money font-extrabold text-3xl">
                {formatMoney(schedule.amountMinor, currency)}
              </span>{" "}
              <span className="font-semibold text-ink-2 text-lg">
                {cadenceAfterAmount(schedule.frequency, schedule.anchorOn)}
              </span>
            </p>
            {paused ? <Badge variant="secondary">Paused</Badge> : null}
          </div>
          {paused ? (
            <PausedNote schedule={schedule} />
          ) : next ? (
            <p className="font-semibold">Next: {formatDay(next)}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href={routes.parentAllowanceEdit(childId)}
            className={buttonVariants({ variant: "secondary", size: "lg" })}
          >
            Change amount or how often
          </Link>
          {paused ? (
            <ResumeButton scheduleId={schedule.id} />
          ) : (
            <PauseSheet scheduleId={schedule.id} nickname={nickname} today={today} />
          )}
          <StopButton scheduleId={schedule.id} nickname={nickname} />
        </div>
      </CardContent>
    </Card>
  );
}

function PausedNote({ schedule }: { schedule: Schedule }) {
  return (
    <div className="grid gap-1">
      <p>
        {schedule.pausedThrough
          ? `Paused until ${formatDay(schedule.pausedThrough)}.${
              schedule.nextDueOn ? ` Next one: ${formatDay(schedule.nextDueOn)}.` : ""
            }`
          : "Paused until a parent resumes it."}
      </p>
      {schedule.pauseMessage ? <p className="text-ink-2">{schedule.pauseMessage}</p> : null}
    </div>
  );
}

/** Runs a Server Action by id and reports a friendly failure; the action refreshes the page. */
function useIdAction(
  scheduleId: string,
  run: (id: string) => Promise<ActionResult<unknown>>,
  success: string,
) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ code: string; message: string }>();
  function submit(onDone?: () => void) {
    setError(undefined);
    start(async () => {
      const result = await runOnline(() => run(scheduleId));
      // After an await, updates leave the transition unless wrapped again (see rule-row.tsx).
      start(() => {
        if (result.ok) {
          toast.success(success);
          onDone?.();
        } else {
          setError(result.error);
        }
      });
    });
  }
  return { pending, error, submit };
}

function ResumeButton({ scheduleId }: { scheduleId: string }) {
  const { pending, error, submit } = useIdAction(
    scheduleId,
    (id) => resumeAllowanceAction(null, { id }),
    "Allowance resumed",
  );
  return (
    <div className="grid gap-2">
      <Button size="lg" loading={pending} onClick={() => submit()}>
        Resume
      </Button>
      <FormError error={error} />
    </div>
  );
}

function StopButton({ scheduleId, nickname }: { scheduleId: string; nickname: string }) {
  const [open, setOpen] = useState(false);
  const { pending, error, submit } = useIdAction(
    scheduleId,
    (id) => stopAllowanceAction(null, { id }),
    "Allowance stopped",
  );
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            size="lg"
            className="border-destructive text-destructive hover:bg-destructive/10"
          />
        }
      >
        Stop allowance
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stop {nickname}'s allowance?</AlertDialogTitle>
          <AlertDialogDescription>Anything already due stays due.</AlertDialogDescription>
        </AlertDialogHeader>
        <FormError error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <Button
            variant="destructive"
            loading={pending}
            onClick={() => submit(() => setOpen(false))}
          >
            Stop allowance
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
