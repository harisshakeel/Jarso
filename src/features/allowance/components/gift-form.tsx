"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, FormError } from "@/components/form";
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
import { type ActionState, idle } from "@/lib";
import { toMajorString } from "../describe";
import { cancelGiftAction, createGiftAction, updateGiftAction } from "../server/actions";
import type { Gift } from "../types";
import { AmountField } from "./amount-field";

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
  const [state, action, pending] = useActionState(
    async (_prev: ActionState<unknown>, formData: FormData) => {
      const result = initial
        ? await updateGiftAction(null, formData)
        : await createGiftAction(null, formData);
      if (result.ok) {
        toast.success("Gift saved");
        router.push(routes.parentAllowance(childId));
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
        <input type="hidden" name="childId" value={childId} />
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

      <FormError message={state?.ok === false && !fieldErrors ? state.error.message : undefined} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          href={routes.parentAllowance(childId)}
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

  function confirm() {
    setError(undefined);
    start(async () => {
      const result = await cancelGiftAction(null, { id: giftId });
      if (result.ok) {
        toast.success("Gift cancelled");
        router.push(routes.parentAllowance(childId));
      } else {
        setError(result.error.message);
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
        <FormError message={error} />
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
