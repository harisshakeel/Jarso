"use client";

import { allowanceCelebrationCopy, type HandoverResult } from "@jarso/core/allowance";
import { NOTE_MAX } from "@jarso/core/notifications";
import { HandCoinsIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { celebrate } from "@/components/celebrate";
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
import { newId, runOnline } from "@/features/offline";
import { type ActionState, cn, formatMoney, idle, parseMoney, toMajorString } from "@/lib";
import { matchSavingAction } from "../server/actions";

type MatchSavingSheetProps = {
  childId: string;
  nickname: string;
  currency: string;
  /** What the child put into Save themselves over the period: the amount offered to match. */
  amountMinor: number;
  /** When they saved it, as the dashboard says it: "this week". */
  period: string;
  className?: string;
};

/**
 * "Match it" (parent dashboard, spec answer 8): the parent adds the same as the child saved to
 * their Save, recorded at once as a gift handed over, with an optional note for their News.
 */
export function MatchSavingSheet({ className, ...props }: MatchSavingSheetProps) {
  const [open, setOpen] = useState(false);
  const { nickname, currency, amountMinor, period } = props;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={cn(
          "inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary text-sm underline-offset-4 hover:underline",
          className,
        )}
      >
        <HandCoinsIcon aria-hidden className="size-4" />
        Match it <span className="sr-only">for {nickname}</span>
      </SheetTrigger>
      <SheetContent side="bottom" className="sm:mx-auto sm:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Match {nickname}'s saving</SheetTitle>
          <SheetDescription>
            {nickname} put {formatMoney(amountMinor, currency, { showMinor: "always" })} into Save{" "}
            {period}. Add the same to their Save as a gift from you. It goes in straight away.
          </SheetDescription>
        </SheetHeader>
        <MatchForm {...props} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function MatchForm({
  childId,
  nickname,
  currency,
  amountMinor,
  onDone,
}: Omit<MatchSavingSheetProps, "className" | "period"> & { onDone: () => void }) {
  // One key per sheet open: confirming again after an error adds the money once.
  const [idempotencyKey] = useState(newId);
  const [amount, setAmount] = useState(() => toMajorString(amountMinor, currency));
  const [message, setMessage] = useState("I matched your saving!");
  const [state, action, pending] = useActionState(
    async (_prev: ActionState<{ result: HandoverResult; noted: boolean }>, formData: FormData) => {
      const result = await runOnline(() => matchSavingAction(null, formData));
      if (result.ok) {
        const minor = parseMoney(amount, currency);
        celebrate({
          icon: "coins",
          title: allowanceCelebrationCopy.matchTitle(nickname),
          amount: minor === null ? undefined : formatMoney(minor, currency),
          body:
            message.trim() && !result.data.noted
              ? allowanceCelebrationCopy.matchNoteFailed
              : allowanceCelebrationCopy.matchBody,
        });
        onDone();
      }
      return result;
    },
    idle,
  );
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;
  const typed = parseMoney(amount, currency);

  return (
    <form action={action} className="grid gap-6 px-4 pb-4 sm:px-6 sm:pb-6">
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <AmountField
        currency={currency}
        value={amount}
        onValueChange={setAmount}
        errors={fieldErrors?.amount}
        label="Add to Save"
      />
      <Field
        name="message"
        label={`Note for ${nickname} (optional)`}
        autoComplete="off"
        maxLength={NOTE_MAX}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        description="It shows in their News."
        errors={fieldErrors?.message}
      />
      <FormError error={state?.ok === false && !fieldErrors ? state.error : undefined} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {typed
          ? `Add ${formatMoney(typed, currency, { showMinor: "nonzero" })} to Save`
          : "Add to Save"}
      </Button>
    </form>
  );
}
