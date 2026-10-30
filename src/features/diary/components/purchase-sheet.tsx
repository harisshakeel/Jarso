"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
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
import { newId, offlineCopy, removeOutboxItem, submitToOutbox } from "@/features/offline";
import type { FieldErrors } from "@/lib";
import { purchaseSchema } from "../schemas";

type PurchaseSheetProps = { currency: string; userId: string };

/** The child's main action: "Spent something?" opens a bottom sheet to record a purchase. */
export function PurchaseSheet({ currency, userId }: PurchaseSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="keycap" size="lg" className="w-full" />}>
        Spent something?
      </SheetTrigger>
      <PurchaseSheetContent currency={currency} userId={userId} onDone={() => setOpen(false)} />
    </Sheet>
  );
}

/** What the form starts with when a purchase is being changed. */
export type PurchaseDraft = { amount: string; label: string };

type PurchaseSheetContentProps = PurchaseSheetProps & {
  /** Prefills the fields ("Change it" on a purchase that needs a look). */
  initial?: PurchaseDraft;
  /** Runs once the new purchase is sent or stored, before the sheet closes. */
  onSaved?: () => Promise<void>;
  onDone: () => void;
};

/** The sheet's body. Shared by "Spent something?" and by changing a purchase that needs a look. */
export function PurchaseSheetContent({ onDone, ...form }: PurchaseSheetContentProps) {
  return (
    <SheetContent side="bottom" className="sm:mx-auto sm:w-full sm:max-w-lg">
      <SheetHeader>
        <SheetTitle>What did you spend?</SheetTitle>
        <SheetDescription>It comes out of your Spend jar.</SheetDescription>
      </SheetHeader>
      {/* Lives inside the sheet, so it unmounts on close: each open gets a new key. */}
      <PurchaseForm {...form} onDone={onDone} />
    </SheetContent>
  );
}

type FormState = { fieldErrors?: FieldErrors; refused?: string; unsaved?: boolean } | null;

function PurchaseForm({
  currency,
  userId,
  initial,
  onSaved,
  onDone,
}: Omit<PurchaseSheetContentProps, "onDone"> & { onDone: () => void }) {
  const router = useRouter();
  // One key per open. Sending again after a refusal reuses it, so a double tap records once.
  const [idempotencyKey] = useState(newId);
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");

  const [state, action, pending] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      // Exactly what the online form posted: the route parses it with this same schema.
      const payload = {
        amount: String(formData.get("amount") ?? ""),
        label: String(formData.get("label") ?? ""),
        idempotencyKey,
      };
      const parsed = purchaseSchema(currency).safeParse(payload);
      if (!parsed.success) {
        return { fieldErrors: z.flattenError(parsed.error).fieldErrors as FieldErrors };
      }

      const result = await submitToOutbox({ userId, kind: "purchase", payload, idempotencyKey });
      switch (result.status) {
        case "sent":
          await onSaved?.();
          toast.success("Saved. Nice one.");
          onDone();
          router.refresh();
          return null;
        case "queued":
          await onSaved?.();
          toast(offlineCopy.waiting);
          onDone();
          return null;
        case "refused":
          // The child is right here to fix it, so it doesn't wait in the outbox.
          await removeOutboxItem(idempotencyKey).catch(() => undefined);
          return { refused: result.message };
        case "unsaved":
          return { unsaved: true };
      }
    },
    null,
  );

  return (
    <form action={action} className="grid gap-6 px-4 pb-4 sm:px-6 sm:pb-6" noValidate>
      <AmountField
        currency={currency}
        value={amount}
        onValueChange={setAmount}
        errors={state?.fieldErrors?.amount}
      />
      <Field
        name="label"
        label="What for? (optional)"
        autoComplete="off"
        maxLength={60}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        errors={state?.fieldErrors?.label}
      />
      <FormError message={state?.refused} />
      {state?.unsaved ? (
        <p role="status" className="rounded-lg bg-muted px-3.5 py-2.5 text-ink-2 text-sm">
          {offlineCopy.offline}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Save
      </Button>
    </form>
  );
}
