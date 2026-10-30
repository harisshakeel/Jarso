"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { AmountField, FormError } from "@/components/form";
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
import { type ActionState, formatMoney, idle } from "@/lib";
import { createDepositAction } from "../server/actions";
import type { DepositResult } from "../types";

type PutInSheetProps = {
  currency: string;
  /** What the child can put in: Spend, less anything already waiting to go in. */
  availableSpendMinor: number;
  /** The child's active rules for putting money in, in plain words. */
  ruleLines?: string[];
};

/** "Put in" on the Save jar: move money from Spend into Save. */
export function PutInSheet({ currency, availableSpendMinor, ruleLines = [] }: PutInSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="lg" className="flex-1" />}>
        Put in
      </SheetTrigger>
      <SheetContent side="bottom" className="sm:mx-auto sm:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Put money into Save</SheetTitle>
          <SheetDescription>
            Spend has {formatMoney(availableSpendMinor, currency, { showMinor: "nonzero" })}
          </SheetDescription>
        </SheetHeader>
        <PutInForm
          currency={currency}
          availableSpendMinor={availableSpendMinor}
          ruleLines={ruleLines}
          onDone={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

/** What the child reads once the server has answered. */
export function depositMessage(result: DepositResult, currency: string): string {
  switch (result.status) {
    case "pending":
      return "Waiting for your parent to confirm";
    case "confirmed":
      return "Added to Save";
    case "over_available":
      return `Spend has ${formatMoney(result.availableMinor, currency, { showMinor: "nonzero" })}`;
  }
}

function PutInForm({
  currency,
  ruleLines,
  onDone,
}: PutInSheetProps & { ruleLines: string[]; onDone: () => void }) {
  const router = useRouter();
  const [idempotencyKey] = useState(newId);
  const [amount, setAmount] = useState("");

  const [state, action, pending] = useActionState(async (_prev: ActionState<DepositResult>) => {
    const result = await runOnline(() => createDepositAction(null, { amount, idempotencyKey }));
    if (result.ok && result.data.status !== "over_available") router.refresh();
    return result;
  }, idle);

  const sent = state?.ok && state.data.status !== "over_available" ? state.data : null;
  const fieldErrors = state && !state.ok ? state.error.fieldErrors : undefined;

  if (sent) {
    return (
      <div className="grid gap-4 px-4 pb-4 sm:px-6 sm:pb-6">
        <p role="status" className="font-bold text-lg">
          {depositMessage(sent, currency)}
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
      {state?.ok ? (
        <p role="status" className="rounded-lg bg-muted px-3.5 py-2.5 text-ink-2 text-sm">
          {depositMessage(state.data, currency)}
        </p>
      ) : (
        <FormError error={fieldErrors ? undefined : state?.error} />
      )}
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Put in
      </Button>
    </form>
  );
}
