"use client";

import { type ChildSummary, familySettingsCopy } from "@jarso/core/family";
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
import { runOnline, useFormSubmit } from "@/features/offline";
import { type ActionState, idle } from "@/lib";
import { setChildPinAction } from "../server/actions";

/** "Reset PIN" button that opens a bottom sheet with the new-PIN form (design.md §6 sheets). */
export function SetPinForm({ child }: { child: ChildSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" />}>
        {familySettingsCopy.resetPin}
        <span className="sr-only">{familySettingsCopy.resetPinFor(child.nickname)}</span>
      </SheetTrigger>
      <SheetContent side="bottom" className="sm:mx-auto sm:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{familySettingsCopy.pinTitle(child.nickname)}</SheetTitle>
          <SheetDescription>{familySettingsCopy.pinBody(child.nickname)}</SheetDescription>
        </SheetHeader>
        {/* Lives inside the sheet, so it unmounts on close and opens fresh each time. */}
        <NewPinForm child={child} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function NewPinForm({ child, onDone }: { child: ChildSummary; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await runOnline(() => setChildPinAction(prev, formData));
    if (result.ok) {
      toast.success(familySettingsCopy.pinUpdated(child.nickname));
      onDone();
    }
    return result;
  }, idle);
  const submit = useFormSubmit(action, state);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  return (
    <form
      action={action}
      onSubmit={submit}
      className="grid gap-6 px-4 pb-4 sm:px-6 sm:pb-6"
      noValidate
    >
      <input type="hidden" name="childId" value={child.id} />
      <Field
        name="pin"
        label={familySettingsCopy.newPin}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={6}
        required
        autoFocus
        description={familySettingsCopy.pinHelp}
        errors={fieldErrors?.pin}
      />
      <FormError error={state?.ok === false && !fieldErrors ? state.error : undefined} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {familySettingsCopy.savePin}
      </Button>
    </form>
  );
}
