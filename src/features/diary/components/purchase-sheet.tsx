"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
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
import { type ActionState, formatMoney, idle } from "@/lib";
import { recordPurchaseAction } from "../server/actions";
import type { PurchaseResult } from "../types";

type PurchaseSheetProps = { currency: string };

/** The child's main action: "Spent something?" opens a bottom sheet to record a purchase. */
export function PurchaseSheet({ currency }: PurchaseSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="keycap" size="lg" className="w-full" />}>
        Spent something?
      </SheetTrigger>
      <SheetContent side="bottom" className="sm:mx-auto sm:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>What did you spend?</SheetTitle>
          <SheetDescription>It comes out of your Spend jar.</SheetDescription>
        </SheetHeader>
        {/* Lives inside the sheet, so it unmounts on close: each open gets a new key. */}
        <PurchaseForm currency={currency} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function PurchaseForm({ currency, onDone }: { currency: string; onDone: () => void }) {
  // One key per open. Sending again after an error reuses it, so a double tap records once.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");

  const [state, action, pending] = useActionState(
    async (_prev: ActionState<PurchaseResult>, formData: FormData) => {
      const result = await recordPurchaseAction(null, formData);
      if (result.ok && result.data.status === "recorded") {
        toast.success("Saved. Nice one.");
        onDone();
      }
      return result;
    },
    idle,
  );

  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;
  const notEnough = state?.ok && state.data.status === "not_enough_spend" ? state.data : undefined;
  const message = notEnough
    ? notEnough.freeMinor <= 0
      ? "Your Spend jar is empty right now. Record money you got first, or ask a parent."
      : `That's more than you have in Spend (${formatMoney(notEnough.freeMinor, currency, { showMinor: "nonzero" })}). Record money you got first, or ask a parent.`
    : state?.ok === false && !fieldErrors
      ? state.error.message
      : undefined;

  return (
    <form action={action} className="grid gap-6 px-4 pb-4 sm:px-6 sm:pb-6" noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <AmountField
        currency={currency}
        value={amount}
        onValueChange={setAmount}
        errors={fieldErrors?.amount}
      />
      <Field
        name="label"
        label="What for? (optional)"
        autoComplete="off"
        maxLength={60}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        errors={fieldErrors?.label}
      />
      <FormError message={message} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Save
      </Button>
    </form>
  );
}
