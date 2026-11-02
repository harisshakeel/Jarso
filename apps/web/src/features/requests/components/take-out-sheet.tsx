"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { AmountField, Field, FormError } from "@/components/form";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui";
import { type Goal, PredictStep } from "@/features/goals";
import { newId, runOnline } from "@/features/offline";
import { type ActionState, formatMoney, idle, parseMoney, toMajorString } from "@/lib";
import { overCapMessage } from "../describe";
import { createWithdrawalAction } from "../server/actions";
import type { WithdrawalResult } from "../types";

type TakeOutSheetProps = {
  currency: string;
  /** The most the child can take out now (already the smaller of Save and any cap). */
  limitMinor: number;
  /** The child's active rules for taking money out, in plain words. */
  ruleLines?: string[];
  /** A different button to open the sheet, e.g. "Ask to use my savings" when a goal is reached. */
  trigger?: { label: string; variant?: "outline" | "keycap-gold" };
  /** With a goal, the child predicts what the take-out does to it before asking (FR05). */
  predict?: {
    goal: Pick<Goal, "name" | "emoji" | "targetMinor" | "planMinor">;
    saveMinor: number;
    reservedMinor: number;
  };
};

/** "Take out" on the Save jar: ask a parent for money from Save. */
export function TakeOutSheet({
  currency,
  limitMinor,
  ruleLines = [],
  trigger,
  predict,
}: TakeOutSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Refresh only once the sheet closes, so the screen behind it can't change while it is open.
  const sent = useRef(false);
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next && sent.current) {
      sent.current = false;
      router.refresh();
    }
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={<Button variant={trigger?.variant ?? "outline"} size="lg" className="flex-1" />}
      >
        {trigger?.label ?? "Take out"}
      </SheetTrigger>
      <SheetContent side="bottom" className="sm:mx-auto sm:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Take money out of Save</SheetTitle>
          <SheetDescription>
            You can take out up to {formatMoney(limitMinor, currency, { showMinor: "nonzero" })}
          </SheetDescription>
        </SheetHeader>
        {/* Lives inside the sheet, so it unmounts on close: each open gets a new key. */}
        <TakeOutForm
          currency={currency}
          limitMinor={limitMinor}
          ruleLines={ruleLines}
          predict={predict}
          onSent={() => {
            sent.current = true;
          }}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

/** What the child reads once the server has answered. */
export function withdrawalMessage(result: WithdrawalResult, currency: string): string {
  switch (result.status) {
    case "pending":
      return "Sent to your parent";
    case "approved":
      return "Approved, your parent will hand it over";
    case "already_sent":
      return "Already sent to your parent";
    case "over_cap":
      return overCapMessage(result.period, result.capMinor, result.usedMinor, currency);
    case "over_available":
      return `You can take out up to ${formatMoney(result.availableMinor, currency, { showMinor: "nonzero" })}`;
  }
}

function isSent(result: WithdrawalResult) {
  return result.status !== "over_available" && result.status !== "over_cap";
}

function TakeOutForm({
  currency,
  limitMinor,
  ruleLines,
  predict,
  onSent,
  onDone,
}: TakeOutSheetProps & { ruleLines: string[]; onSent: () => void; onDone: () => void }) {
  // One key per open: a double tap, or sending again after a refusal, asks once.
  const [idempotencyKey] = useState(newId);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const [state, action, pending] = useActionState(async (_prev: ActionState<WithdrawalResult>) => {
    const result = await runOnline(() =>
      createWithdrawalAction(null, { amount, reason, idempotencyKey }),
    );
    if (result.ok && isSent(result.data)) onSent();
    return result;
  }, idle);

  const sent = state?.ok && isSent(state.data) ? state.data : null;
  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;

  if (sent) {
    return (
      <div className="grid gap-4 px-4 pb-4 sm:px-6 sm:pb-6">
        <p role="status" className="font-bold text-lg">
          {withdrawalMessage(sent, currency)}
        </p>
        <Button type="button" size="lg" className="w-full" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-6 px-4 pb-4 sm:px-6 sm:pb-6" noValidate>
      {ruleLines.length > 0 ? (
        <ul className="grid gap-1 text-ink-2 text-sm">
          {ruleLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      <AmountField
        currency={currency}
        value={amount}
        onValueChange={setAmount}
        errors={fieldErrors?.amount}
      />
      {predict ? (
        <PredictStep
          move="take_out"
          amountMinor={parseMoney(amount, currency)}
          goal={predict.goal}
          saveMinor={predict.saveMinor}
          reservedMinor={predict.reservedMinor}
          currency={currency}
          maxMinor={limitMinor}
          onTryAmount={(minor) => setAmount(toMajorString(minor, currency))}
        />
      ) : null}
      <Field
        name="reason"
        label="What's it for?"
        autoComplete="off"
        maxLength={140}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        errors={fieldErrors?.reason}
      />
      {state?.ok ? (
        <p role="status" className="rounded-lg bg-muted px-3.5 py-2.5 text-ink-2 text-sm">
          {withdrawalMessage(state.data, currency)}
        </p>
      ) : (
        <FormError error={fieldErrors ? undefined : state?.error} />
      )}
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Ask
      </Button>
    </form>
  );
}
