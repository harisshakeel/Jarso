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
import { runOnline } from "@/features/offline";
import { type ActionState, idle } from "@/lib";
import { renameChildAction } from "../server/actions";
import type { ChildSummary } from "../types";

/** "Rename" button that opens a bottom sheet with the new-nickname form, like SetPinForm. */
export function RenameChildForm({ child }: { child: ChildSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        Rename<span className="sr-only"> {child.nickname}</span>
      </SheetTrigger>
      <SheetContent side="bottom" className="sm:mx-auto sm:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>New nickname for {child.nickname}</SheetTitle>
          <SheetDescription>
            {child.nickname} signs in with their nickname, so tell them the new one.
          </SheetDescription>
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
      toast.success("Nickname updated");
      onDone();
    }
    return result;
  }, idle);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  return (
    <form action={action} className="grid gap-6 px-4 pb-4 sm:px-6 sm:pb-6" noValidate>
      <input type="hidden" name="childId" value={child.id} />
      <Field
        name="nickname"
        label="Nickname"
        defaultValue={child.nickname}
        autoComplete="off"
        maxLength={20}
        required
        autoFocus
        description="Up to 20 letters, numbers, spaces, dots, dashes or apostrophes."
        errors={fieldErrors?.nickname}
      />
      <FormError
        message={state?.ok === false && !fieldErrors ? state.error.message : undefined}
        calm={state?.ok === false && state.error.code === "UNAVAILABLE"}
      />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Save nickname
      </Button>
    </form>
  );
}
