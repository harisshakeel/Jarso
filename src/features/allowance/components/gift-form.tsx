"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { AmountField, Field, FormError } from "@/components/form";
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
  buttonVariants,
  Card,
  CardContent,
} from "@/components/ui";
import { routes } from "@/config";
import { runOnline } from "@/features/offline";
import { type ActionState, idle, toMajorString } from "@/lib";

import { cancelGiftAction, createGiftAction, updateGiftAction } from "../server/actions";
import type { Gift } from "../types";

type GiftFormProps = {
  childId: string;
  nickname: string;
  currency: string;
  /** Family-local date, `YYYY-MM-DD`. */
  today: string;
  /** Present when editing a gift that hasn't been handed over. */
  initial?: Gift;
  /** Amount carried over from the allowance form, as the parent typed it. */
  defaultAmount?: string;
};

/** A one-time gift for the child: amount, the day to give it, and an optional note. */
export function GiftForm({
  childId,
  nickname,
  currency,
  today,
  initial,
  defaultAmount,
}: GiftFormProps) {
  const router = useRouter();
  // One key per form open. Saving again after an error reuses it, so a lost response makes one gift.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(
    async (_prev: ActionState<unknown>, formData: FormData) => {
      const result = initial
        ? await runOnline(() => updateGiftAction(null, formData))
        : await runOnline(() => createGiftAction(null, formData));
      if (result.ok) {
        toast.success("Gift saved");
        router.push(routes.parentChild(childId));
      }
      return result;
    },
    idle,
  );
  const [amount, setAmount] = useState(
    initial ? toMajorString(initial.amountMinor, currency) : (defaultAmount ?? ""),
  );
  const [giveOn, setGiveOn] = useState(initial?.giveOn ?? today);
  const [note, setNote] = useState(initial?.note ?? "");
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  return (
    <form action={action} className="grid gap-4" noValidate>
      {initial ? (
        <input type="hidden" name="giftId" value={initial.id} />
      ) : (
        <>
          <input type="hidden" name="childId" value={childId} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        </>
      )}
      <Card className="rise-in shadow-raised">
        <CardContent>
          <AmountField
            currency={currency}
            value={amount}
            onValueChange={setAmount}
            errors={fieldErrors?.amount}
          />
        </CardContent>
      </Card>
      <Card className="rise-in" style={{ "--rise-index": 1 } as CSSProperties}>
        <CardContent className="grid gap-6">
          <Field
            name="giveOn"
            label="Give on"
            type="date"
            min={initial ? undefined : today}
            required
            value={giveOn}
            onChange={(event) => setGiveOn(event.target.value)}
            errors={fieldErrors?.giveOn}
          />
          <Field
            name="note"
            label={`Note for ${nickname} (optional)`}
            autoComplete="off"
            maxLength={140}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            errors={fieldErrors?.note}
          />
        </CardContent>
      </Card>

      <FormError
        message={state?.ok === false && !fieldErrors ? state.error.message : undefined}
        calm={state?.ok === false && state.error.code === "UNAVAILABLE"}
      />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          href={routes.parentChild(childId)}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Cancel
        </Link>
        <Button type="submit" size="lg" loading={pending}>
          Save gift
        </Button>
      </div>
    </form>
  );
}

/** "Cancel this gift" for the edit screen, behind a confirmation. Goes back when done. */
export function CancelGiftForm({
  childId,
  giftId,
  nickname,
}: {
  childId: string;
  giftId: string;
  nickname: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [calm, setCalm] = useState(false);

  function confirm() {
    setError(undefined);
    start(async () => {
      const result = await runOnline(() => cancelGiftAction(null, { id: giftId }));
      if (result.ok) {
        toast.success("Gift cancelled");
        router.push(routes.parentChild(childId));
      } else {
        setError(result.error.message);
        setCalm(result.error.code === "UNAVAILABLE");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" size="lg" />}>
        Cancel this gift
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this gift?</AlertDialogTitle>
          <AlertDialogDescription>{nickname} won't see it.</AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} calm={calm} />
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <Button variant="destructive" loading={pending} onClick={confirm}>
            Cancel gift
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
