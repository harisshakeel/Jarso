"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Field, FormError } from "@/components/form";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui";
import { type ActionState, idle } from "@/lib";
import { setChildPinAction } from "../server/actions";
import type { ChildSummary } from "../types";

/** "Reset PIN" button that opens a bottom sheet with the new-PIN form (design.md §6 sheets). */
export function SetPinForm({ child }: { child: ChildSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        Reset PIN<span className="sr-only"> for {child.nickname}</span>
      </SheetTrigger>
      <SheetContent side="bottom" className="sm:mx-auto sm:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>New PIN for {child.nickname}</SheetTitle>
          <SheetDescription>
            The old PIN stops working straight away. Tell {child.nickname} the new one.
          </SheetDescription>
        </SheetHeader>
        {/* Lives inside the sheet, so it unmounts on close and opens fresh each time. */}
        <NewPinForm child={child} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function NewPinForm({ child, onDone }: { child: ChildSummary; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await setChildPinAction(prev, formData);
    if (result.ok) {
      toast.success(`PIN updated for ${child.nickname}`);
      onDone();
    }
    return result;
  }, idle);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  return (
    <form action={action} className="grid gap-6 px-4 pb-4 sm:px-6 sm:pb-6" noValidate>
      <input type="hidden" name="childId" value={child.id} />
      <Field
        name="pin"
        label="New PIN"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="new-password"
        maxLength={6}
        required
        autoFocus
        description="4 to 6 numbers."
        errors={fieldErrors?.pin}
      />
      <FormError message={state?.ok === false && !fieldErrors ? state.error.message : undefined} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Save PIN
      </Button>
    </form>
  );
}
