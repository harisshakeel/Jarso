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
import { newId, runOnline } from "@/features/offline";
import { type ActionState, idle } from "@/lib";
import { createEmergencyAction } from "../server/actions";
import type { EmergencyResult } from "../types";

type AskExtraSheetProps = { currency: string };

/**
 * "Ask for extra" (FR15): the child asks their parent for extra money with a reason. Nothing is
 * reserved; if the parent says yes it lands in Spend when they hand it over.
 */
export function AskExtraSheet({ currency }: AskExtraSheetProps) {
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
      <SheetTrigger render={<Button variant="outline" size="lg" className="w-full" />}>
        Ask for extra
      </SheetTrigger>
      <SheetContent side="bottom" className="sm:mx-auto sm:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Ask for extra money</SheetTitle>
          <SheetDescription>
            Say what it's for. If your parent says yes, it goes into Spend when they hand it over.
          </SheetDescription>
        </SheetHeader>
        {/* Lives inside the sheet, so it unmounts on close: each open gets a new key. */}
        <AskExtraForm
          currency={currency}
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
export function emergencyMessage(result: EmergencyResult): string {
  return result.status === "pending" ? "Sent to your parent" : "Already sent to your parent";
}

function AskExtraForm({
  currency,
  onSent,
  onDone,
}: AskExtraSheetProps & { onSent: () => void; onDone: () => void }) {
  // One key per open: a double tap asks once.
  const [idempotencyKey] = useState(newId);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const [state, action, pending] = useActionState(async (_prev: ActionState<EmergencyResult>) => {
    const result = await runOnline(() =>
      createEmergencyAction(null, { amount, reason, idempotencyKey }),
    );
    if (result.ok) onSent();
    return result;
  }, idle);

  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;

  if (state?.ok) {
    return (
      <div className="grid gap-4 px-4 pb-4 sm:px-6 sm:pb-6">
        <p role="status" className="font-bold text-lg">
          {emergencyMessage(state.data)}
        </p>
        <Button type="button" size="lg" className="w-full" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-6 px-4 pb-4 sm:px-6 sm:pb-6" noValidate>
      <AmountField
        currency={currency}
        value={amount}
        onValueChange={setAmount}
        errors={fieldErrors?.amount}
      />
      <Field
        name="reason"
        label="What's it for?"
        autoComplete="off"
        maxLength={140}
        required
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        errors={fieldErrors?.reason}
      />
      <FormError error={fieldErrors ? undefined : state?.error} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Ask
      </Button>
    </form>
  );
}
