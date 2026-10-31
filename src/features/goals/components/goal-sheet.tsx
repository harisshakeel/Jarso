"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { AmountField, Field, FieldError, FormError } from "@/components/form";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui";
import { runOnline } from "@/features/offline";
import { type ActionState, cn, formatMoney, idle, parseMoney, toMajorString } from "@/lib";
import { GOAL_EMOJI, type GoalEmoji } from "../emoji";
import { goalProgress } from "../progress";
import { archiveGoalAction, saveGoalAction } from "../server/actions";
import type { Goal } from "../types";
import { PredictStep } from "./predict-step";

type GoalSheetProps = {
  goal: Goal | null;
  currency: string;
  /** The child's allowance, for the plan field's hint; null without a schedule. */
  allowanceMinor: number | null;
  /** Current Save and money waiting to come out of it, for the live preview. */
  saveMinor: number;
  reservedMinor: number;
};

/** "Set a goal" / "Change my goal": the child's own goal, with a live estimate (FR02). */
export function GoalSheet(props: GoalSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="lg" className="flex-1" />}>
        {props.goal ? "Change my goal" : "Set a goal"}
      </SheetTrigger>
      <SheetContent side="bottom" className="sm:mx-auto sm:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{props.goal ? "Your goal" : "Something to save for"}</SheetTitle>
          <SheetDescription>Pick something you want and how much it costs.</SheetDescription>
        </SheetHeader>
        {/* Inside the sheet, so it starts fresh from the saved goal each time it opens. */}
        <GoalForm {...props} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

/** "About N more allowances", or a nudge to set a plan. Pure arithmetic; never writes. */
export function previewLine(
  input: { target: string; plan: string; saveMinor: number; reservedMinor: number },
  currency: string,
): string | null {
  const targetMinor = parseMoney(input.target, currency);
  if (!targetMinor) return null;
  const planMinor = input.plan.trim() === "" ? null : parseMoney(input.plan, currency);
  const progress = goalProgress({
    saveMinor: input.saveMinor,
    reservedMinor: input.reservedMinor,
    targetMinor,
    planMinor,
  });
  if (progress.reached) return "You've already saved enough for this.";
  if (progress.paymentsLeft === null) {
    return "Set how much you'll save each time to see how long it'll take";
  }
  return progress.paymentsLeft === 1
    ? "About 1 more allowance"
    : `About ${progress.paymentsLeft} more allowances`;
}

function GoalForm({
  goal,
  currency,
  allowanceMinor,
  saveMinor,
  reservedMinor,
  onDone,
}: GoalSheetProps & { onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(goal?.name ?? "");
  const [emoji, setEmoji] = useState(goal?.emoji ?? "");
  const [target, setTarget] = useState(goal ? toMajorString(goal.targetMinor, currency) : "");
  const [plan, setPlan] = useState(goal?.planMinor ? toMajorString(goal.planMinor, currency) : "");

  const [state, action, pending] = useActionState(async (_prev: ActionState<string>) => {
    const result = await runOnline(() =>
      // The server checks the emoji is one of the set; an unpicked one is refused there.
      saveGoalAction(null, { name, emoji: emoji as GoalEmoji, target, plan }),
    );
    if (result.ok) {
      router.refresh();
      onDone();
    }
    return result;
  }, idle);

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;
  const preview = previewLine({ target, plan, saveMinor, reservedMinor }, currency);
  // FR05: changing an existing plan is a decision about savings, so the child predicts it first.
  const planMinor = plan.trim() === "" ? null : parseMoney(plan, currency);
  // The edited target, so the prediction matches the screen after saving; the saved one otherwise.
  const targetMinor = parseMoney(target, currency) ?? goal?.targetMinor ?? null;
  const reached =
    goal !== null &&
    targetMinor !== null &&
    goalProgress({ saveMinor, reservedMinor, targetMinor, planMinor: goal.planMinor }).reached;
  // Any new plan on an unreached goal (the first one included) is a decision worth predicting.
  const planChanged =
    goal !== null &&
    !reached &&
    planMinor !== null &&
    planMinor > 0 &&
    planMinor !== goal.planMinor;

  return (
    <form action={action} className="grid gap-6 px-4 pb-4 sm:px-6 sm:pb-6" noValidate>
      <Field
        name="name"
        label="What is it?"
        autoComplete="off"
        maxLength={40}
        value={name}
        onChange={(event) => setName(event.target.value)}
        errors={fieldErrors?.name}
      />
      <fieldset className="grid gap-2">
        <legend className="mb-2 font-semibold text-sm">Pick a picture</legend>
        <div className="grid grid-cols-6 gap-2">
          {GOAL_EMOJI.map((option) => (
            <label
              key={option}
              className={cn(
                "flex size-11 cursor-pointer items-center justify-center rounded-lg border text-2xl has-focus-visible:ring-2 has-focus-visible:ring-ring",
                emoji === option ? "border-primary bg-teal-100 dark:bg-teal-900" : "border-border",
              )}
            >
              <input
                type="radio"
                name="emoji"
                value={option}
                checked={emoji === option}
                onChange={() => setEmoji(option)}
                className="sr-only"
                aria-label={option}
              />
              <span aria-hidden>{option}</span>
            </label>
          ))}
        </div>
        <FieldError id="emoji-error" errors={fieldErrors?.emoji} />
      </fieldset>
      <AmountField
        currency={currency}
        id="target"
        label="How much does it cost?"
        value={target}
        onValueChange={setTarget}
        errors={fieldErrors?.target}
      />
      <AmountField
        currency={currency}
        id="plan"
        label="How much will you save each time?"
        value={plan}
        onValueChange={setPlan}
        errors={fieldErrors?.plan}
        describedBy={allowanceMinor ? "goal-plan-hint" : undefined}
      />
      {allowanceMinor ? (
        <p id="goal-plan-hint" className="-mt-4 text-ink-2 text-sm">
          Up to {formatMoney(allowanceMinor, currency, { showMinor: "nonzero" })} from each
          allowance.
        </p>
      ) : null}
      {goal && planChanged && targetMinor !== null ? (
        <PredictStep
          move="change_plan"
          amountMinor={planMinor}
          goal={{ ...goal, targetMinor }}
          saveMinor={saveMinor}
          reservedMinor={reservedMinor}
          currency={currency}
          maxMinor={allowanceMinor ?? goal.targetMinor}
          onTryAmount={(minor) => setPlan(toMajorString(minor, currency))}
        />
      ) : preview ? (
        <p role="status" className="rounded-lg bg-muted px-3.5 py-2.5 font-semibold">
          {preview}
        </p>
      ) : null}
      <FormError error={fieldErrors ? undefined : state && !state.ok ? state.error : undefined} />
      <Button type="submit" variant="keycap" size="lg" className="w-full" loading={pending}>
        Save my goal
      </Button>
      {goal ? <StartNewGoal goalId={goal.id} onDone={onDone} /> : null}
    </form>
  );
}

/** Archives the goal behind a confirm step, so the child can pick something new. */
function StartNewGoal({ goalId, onDone }: { goalId: string; onDone: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setOpen(false);
    const result = await runOnline(() => archiveGoalAction(null, { goalId }));
    if (!result.ok) return setError(result.error.message);
    router.refresh();
    onDone();
  }

  return (
    <div className="grid gap-2">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button type="button" variant="outline" size="lg" />}>
          Start a new goal
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new goal?</AlertDialogTitle>
            <AlertDialogDescription>
              This goal closes. Your money stays in Save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep this goal</AlertDialogCancel>
            <Button type="button" onClick={confirm}>
              Yes, start a new goal
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
