"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AmountField, ChoiceChips, Field, FormError } from "@/components/form";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui";
import { RECEIVED_CATEGORIES } from "@/features/ledger";
import { newId, runOnline } from "@/features/offline";
import type { FieldErrors } from "@/lib";
import { receivedSchema } from "../schemas";
import { recordMoneyReceivedAction } from "../server/actions";
import { CategoryChips } from "./category-chips";

const JARS = [
  { value: "spend", label: "Spend" },
  { value: "save", label: "Save" },
] as const;

/**
 * "Got money" opens a bottom sheet to record money from another source (a gift, a job, a find).
 * It counts at once: no parent approval. Online only, like Undo.
 */
export function ReceivedSheet({ currency }: { currency: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="lg" className="w-full" />}>
        Got money
      </SheetTrigger>
      <SheetContent side="bottom" className="sm:mx-auto sm:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>What did you get?</SheetTitle>
          <SheetDescription>It goes into your jar right away.</SheetDescription>
        </SheetHeader>
        {/* Lives inside the sheet, so it unmounts on close: each open gets a new key. */}
        <ReceivedForm currency={currency} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

type FormState = { fieldErrors?: FieldErrors; refused?: string; notice?: string } | null;

function ReceivedForm({ currency, onDone }: { currency: string; onDone: () => void }) {
  const router = useRouter();
  // One key per open. Sending again after a refusal reuses it, so a double tap records once.
  const [idempotencyKey] = useState(newId);
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [jar, setJar] = useState<"spend" | "save">("spend");
  const [category, setCategory] = useState<string | null>(null);

  const [state, action, pending] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const payload = {
        amount: String(formData.get("amount") ?? ""),
        jar: String(formData.get("jar") ?? ""),
        category: String(formData.get("category") ?? ""),
        label: String(formData.get("label") ?? ""),
        idempotencyKey,
      };
      const parsed = receivedSchema(currency).safeParse(payload);
      if (!parsed.success) {
        return { fieldErrors: z.flattenError(parsed.error).fieldErrors as FieldErrors };
      }

      const result = await runOnline(() =>
        recordMoneyReceivedAction(null, payload as Parameters<typeof recordMoneyReceivedAction>[1]),
      );
      if (result.ok) {
        toast.success("Saved. Nice one.");
        onDone();
        router.refresh();
        return null;
      }
      return result.error.code === "UNAVAILABLE"
        ? { notice: result.error.message }
        : { refused: result.error.message };
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
      <CategoryChips
        options={RECEIVED_CATEGORIES}
        value={category}
        onChange={setCategory}
        legend="Where did it come from?"
      />
      <div className="grid gap-2">
        <ChoiceChips
          name="jar"
          legend="Which jar?"
          options={JARS}
          value={jar}
          onValueChange={(value) => setJar(value === "save" ? "save" : "spend")}
        />
        {jar === "save" ? (
          <p className="text-ink-2 text-sm">Give the cash to your parent to keep.</p>
        ) : null}
      </div>
      <Field
        name="label"
        label="Name it (optional)"
        placeholder="Who or what was it?"
        autoComplete="off"
        maxLength={60}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        errors={state?.fieldErrors?.label}
      />
      <FormError message={state?.refused} />
      {state?.notice ? (
        <p role="status" className="rounded-lg bg-muted px-3.5 py-2.5 text-ink-2 text-sm">
          {state.notice}
        </p>
      ) : null}
      <div className="grid gap-2">
        <Button type="submit" size="lg" className="w-full" loading={pending} disabled={!category}>
          Write it down
        </Button>
        {category ? null : (
          <p className="text-center text-muted-foreground">Pick where it came from</p>
        )}
      </div>
    </form>
  );
}
