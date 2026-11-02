"use client";

import {
  fixSchema,
  notEnoughSaveToFixMessage,
  notEnoughSpendToLowerMessage,
  notEnoughSpendToRaiseMessage,
  notFixableMessage,
  unchangedMessage,
} from "@jarso/core/diary";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AmountField, Field, FormError } from "@/components/form";
import { Button } from "@/components/ui";
import {
  categoryOf,
  type HistoryItem,
  RECEIVED_CATEGORIES,
  SPEND_CATEGORIES,
} from "@/features/ledger";
import { newId, runOnline } from "@/features/offline";
import { type FieldErrors, toMajorString } from "@/lib";
import { correctDiaryEntryAction } from "../server/actions";
import { CategoryChips } from "./category-chips";

type FormState = { fieldErrors?: FieldErrors; refused?: string; notice?: string } | null;

/** The database labels a nameless line with these; the form shows them as an empty name. */
const FALLBACK_LABELS = ["Purchase", "Money received"];

/**
 * Fix the amount, the category or the name of one line. No jar picker: a fix never moves money
 * between jars. Online only, like Undo.
 */
export function FixForm({
  item,
  currency,
  onDone,
}: {
  item: HistoryItem;
  currency: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const kind = item.kind === "received" ? "received" : "purchase";
  // One key per open: sending again after a refusal reuses it.
  const [idempotencyKey] = useState(newId);
  const [amount, setAmount] = useState(toMajorString(item.amountMinor ?? 0, currency));
  const [label, setLabel] = useState(FALLBACK_LABELS.includes(item.label) ? "" : item.label);
  const [category, setCategory] = useState<string | null>(categoryOf(item.category, kind).key);

  const [state, action, pending] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const payload = {
        entryId: item.entryId ?? "",
        amount: String(formData.get("amount") ?? ""),
        category: String(formData.get("category") ?? ""),
        label: String(formData.get("label") ?? ""),
        idempotencyKey,
      };
      const parsed = fixSchema(currency).safeParse(payload);
      if (!parsed.success) {
        return { fieldErrors: z.flattenError(parsed.error).fieldErrors as FieldErrors };
      }

      const result = await runOnline(() =>
        correctDiaryEntryAction(null, payload as Parameters<typeof correctDiaryEntryAction>[1]),
      );
      if (!result.ok) {
        return result.error.code === "UNAVAILABLE"
          ? { notice: result.error.message }
          : { refused: result.error.message };
      }
      const outcome = result.data;
      switch (outcome.status) {
        case "fixed":
          toast.success("Fixed.");
          onDone();
          router.refresh();
          return null;
        case "unchanged":
          return { notice: unchangedMessage };
        case "not_fixable":
          return { refused: notFixableMessage };
        case "not_enough_spend":
          return {
            refused:
              kind === "received"
                ? notEnoughSpendToLowerMessage(item.amountMinor ?? 0, outcome.freeMinor, currency)
                : notEnoughSpendToRaiseMessage(item.amountMinor ?? 0, outcome.freeMinor, currency),
          };
        case "not_enough_save":
          return { refused: notEnoughSaveToFixMessage };
      }
    },
    null,
  );

  return (
    <form action={action} className="grid gap-6" noValidate>
      <AmountField
        currency={currency}
        value={amount}
        onValueChange={setAmount}
        errors={state?.fieldErrors?.amount}
      />
      <CategoryChips
        options={kind === "received" ? RECEIVED_CATEGORIES : SPEND_CATEGORIES}
        value={category}
        onChange={setCategory}
        legend={kind === "received" ? "Where did it come from?" : "What was it for?"}
      />
      <Field
        name="label"
        label="Name it (optional)"
        autoComplete="off"
        maxLength={60}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        errors={state?.fieldErrors?.label}
      />
      <p className="text-ink-2 text-sm">To move money between jars, put it in or take it out.</p>
      <FormError message={state?.refused} />
      {state?.notice ? (
        <p role="status" className="rounded-lg bg-muted px-3.5 py-2.5 text-ink-2 text-sm">
          {state.notice}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={!category}>
        Save the fix
      </Button>
    </form>
  );
}
