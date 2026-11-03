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
import { renameChildAction } from "../server/actions";

/** "Rename" button that opens a bottom sheet with the new-nickname form, like SetPinForm. */
export function RenameChildForm({ child }: { child: ChildSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" />}>
        {familySettingsCopy.rename}
        <span className="sr-only"> {child.nickname}</span>
      </SheetTrigger>
      <SheetContent side="bottom" className="sm:mx-auto sm:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{familySettingsCopy.renameTitle(child.nickname)}</SheetTitle>
          <SheetDescription>{familySettingsCopy.renameBody(child.nickname)}</SheetDescription>
        </SheetHeader>
        <NicknameForm child={child} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function NicknameForm({ child, onDone }: { child: ChildSummary; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await runOnline(() => renameChildAction(prev, formData));
    if (result.ok) {
      toast.success(familySettingsCopy.renamed);
      onDone();
    }
    return result;
  }, idle);
  const submit = useFormSubmit(action);
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
        name="nickname"
        label={familySettingsCopy.nickname}
        defaultValue={child.nickname}
        autoComplete="off"
        maxLength={20}
        required
        autoFocus
        description={familySettingsCopy.nicknameHelp}
        errors={fieldErrors?.nickname}
      />
      <FormError error={state?.ok === false && !fieldErrors ? state.error : undefined} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {familySettingsCopy.saveNickname}
      </Button>
    </form>
  );
}
