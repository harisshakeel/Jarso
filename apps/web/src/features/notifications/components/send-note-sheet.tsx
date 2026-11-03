"use client";

import { NOTE_MAX, type NoteResult, noteCopy } from "@jarso/core/notifications";
import { MessageCircleHeartIcon } from "lucide-react";
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
import { newId, runOnline } from "@/features/offline";
import { type ActionState, cn, idle } from "@/lib";
import { sendChildNoteAction } from "../server/actions";

type SendNoteSheetProps = {
  childId: string;
  nickname: string;
  /** Ready lines the parent can tap to start from, fitting what they were looking at. */
  suggestions?: readonly string[];
  /** The trigger's look; it reads like the link beside it by default. */
  className?: string;
};

/**
 * "Send a note" (parent dashboard, spec answer 8): a short note from the parent that lands in
 * the child's News. A bottom sheet with a few ready lines to start from; nothing is sent until
 * the parent taps Send.
 */
export function SendNoteSheet({
  childId,
  nickname,
  suggestions = [],
  className,
}: SendNoteSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={cn(
          "inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary text-sm underline-offset-4 hover:underline",
          className,
        )}
      >
        <MessageCircleHeartIcon aria-hidden className="size-4" />
        {noteCopy.trigger} <span className="sr-only">{noteCopy.triggerTo(nickname)}</span>
      </SheetTrigger>
      <SheetContent side="bottom" className="sm:mx-auto sm:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{noteCopy.title(nickname)}</SheetTitle>
          <SheetDescription>{noteCopy.body(nickname)}</SheetDescription>
        </SheetHeader>
        {/* Lives inside the sheet, so it unmounts on close and opens fresh, with a new key. */}
        <NoteForm
          childId={childId}
          nickname={nickname}
          suggestions={suggestions}
          onDone={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function NoteForm({
  childId,
  nickname,
  suggestions,
  onDone,
}: Omit<SendNoteSheetProps, "className"> & { suggestions: readonly string[]; onDone: () => void }) {
  // One key per sheet open: sending again after an error reuses it, so the child gets one note.
  const [idempotencyKey] = useState(newId);
  const [text, setText] = useState("");
  const [state, action, pending] = useActionState(
    async (_prev: ActionState<{ status: NoteResult }>, formData: FormData) => {
      const result = await runOnline(() => sendChildNoteAction(null, formData));
      if (result.ok) {
        toast.success(noteCopy.sent(nickname));
        onDone();
      }
      return result;
    },
    idle,
  );
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  return (
    <form action={action} className="grid gap-4 px-4 pb-4 sm:px-6 sm:pb-6">
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {suggestions.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={noteCopy.ideas}>
          {suggestions.map((line) => (
            <li key={line}>
              <Button
                type="button"
                variant="secondary"
                className="h-auto min-h-11 whitespace-normal py-2 text-left text-sm"
                onClick={() => setText(line)}
              >
                {line}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Field
        name="text"
        label={noteCopy.label}
        autoComplete="off"
        required
        maxLength={NOTE_MAX}
        value={text}
        onChange={(event) => setText(event.target.value)}
        description={noteCopy.count(text.length, NOTE_MAX)}
        errors={fieldErrors?.text}
      />
      <FormError error={state?.ok === false && !fieldErrors ? state.error : undefined} />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {noteCopy.send(nickname)}
      </Button>
    </form>
  );
}
