"use client";

import { type ChildSummary, familySettingsCopy } from "@jarso/core/family";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form";
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
} from "@/components/ui";
import { runOnline, useFormSubmit } from "@/features/offline";
import { type ActionState, idle } from "@/lib";
import { removeChildAction } from "../server/actions";

/**
 * "Remove" button plus the confirmation dialog that spells out what happens (design.md §6:
 * destructive only for irreversible actions). The form lives inside the dialog so it resets
 * each time it opens.
 */
export function RemoveChildDialog({ child }: { child: ChildSummary }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await runOnline(() => removeChildAction(prev, formData));
    if (result.ok) {
      toast.success(familySettingsCopy.removed(child.nickname));
      setOpen(false);
    }
    return result;
  }, idle);
  const submit = useFormSubmit(action);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="ghost" />}>
        {familySettingsCopy.remove}
        <span className="sr-only"> {child.nickname}</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{familySettingsCopy.removeTitle(child.nickname)}</AlertDialogTitle>
          <AlertDialogDescription>
            {familySettingsCopy.removeBody(child.nickname)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action} onSubmit={submit} className="contents" noValidate>
          <input type="hidden" name="childId" value={child.id} />
          <FormError error={state?.ok === false ? state.error : undefined} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {familySettingsCopy.keepChild(child.nickname)}
            </AlertDialogCancel>
            <Button type="submit" variant="destructive" size="lg" loading={pending}>
              {familySettingsCopy.removeChild(child.nickname)}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
