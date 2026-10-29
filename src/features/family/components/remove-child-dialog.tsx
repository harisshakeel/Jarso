"use client";

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
import { type ActionState, idle } from "@/lib";
import { removeChildAction } from "../server/actions";
import type { ChildSummary } from "../types";

/**
 * "Remove" button plus the confirmation dialog that spells out what happens (design.md §6:
 * destructive only for irreversible actions). The form lives inside the dialog so it resets
 * each time it opens.
 */
export function RemoveChildDialog({ child }: { child: ChildSummary }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await removeChildAction(prev, formData);
    if (result.ok) {
      toast.success(`${child.nickname} was removed from your family`);
      setOpen(false);
    }
    return result;
  }, idle);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="sm" className="text-destructive" />}
      >
        Remove<span className="sr-only"> {child.nickname}</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {child.nickname} from your family?</AlertDialogTitle>
          <AlertDialogDescription>
            {child.nickname} will be signed out on every device and their PIN will stop working.
            Their account is deleted. You can add {child.nickname} again later with a new PIN. This
            can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action} className="contents" noValidate>
          <input type="hidden" name="childId" value={child.id} />
          <FormError message={state?.ok === false ? state.error.message : undefined} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep {child.nickname}</AlertDialogCancel>
            <Button type="submit" variant="destructive" size="lg" loading={pending}>
              Remove {child.nickname}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
