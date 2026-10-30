"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { ChoiceChips, Field, FormError } from "@/components/form";
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
import { pauseAllowanceAction } from "../server/actions";

type PauseSheetProps = {
  scheduleId: string;
  nickname: string;
  /** Family-local date, `YYYY-MM-DD`. */
  today: string;
};

/** "Pause" button that opens a bottom sheet (spec §5.3). */
export function PauseSheet({ scheduleId, nickname, today }: PauseSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="lg" />}>Pause</SheetTrigger>
      <SheetContent side="bottom" className="sm:mx-auto sm:w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Pause {nickname}'s allowance</SheetTitle>
          <SheetDescription>
            No allowance falls due while paused. Missed allowances aren't paid later. Anything
            already due stays due.
          </SheetDescription>
        </SheetHeader>
        {/* Lives inside the sheet, so it unmounts on close and opens fresh each time. */}
        <PauseForm
          scheduleId={scheduleId}
          nickname={nickname}
          today={today}
          onDone={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

const untilOptions = [
  { value: "date", label: "A date" },
  { value: "resume", label: "I resume it" },
] as const;

function PauseForm({
  scheduleId,
  nickname,
  today,
  onDone,
}: PauseSheetProps & { onDone: () => void }) {
  const [state, action, pending] = useActionState(
    async (_prev: ActionState, formData: FormData) => {
      const result = await runOnline(() => pauseAllowanceAction(null, formData));
      if (result.ok) {
        toast.success("Allowance paused");
        onDone();
      }
      return result;
    },
    idle,
  );
  const [until, setUntil] = useState<string>("date");
  const [through, setThrough] = useState("");
  const [message, setMessage] = useState("");
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  return (
    <form action={action} className="grid gap-6 px-4 pb-4 sm:px-6 sm:pb-6">
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <ChoiceChips
        name="until"
        legend="Until"
        options={untilOptions}
        value={until}
        onValueChange={setUntil}
      />
      {until === "date" ? (
        <Field
          name="through"
          label="Pause until"
          type="date"
          min={today}
          required
          value={through}
          onChange={(event) => setThrough(event.target.value)}
          errors={fieldErrors?.through}
        />
      ) : (
        <input type="hidden" name="through" value="" />
      )}
      <Field
        name="message"
        label={`Message for ${nickname} (optional)`}
        autoComplete="off"
        maxLength={140}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        errors={fieldErrors?.message}
      />
      <FormError
        message={state?.ok === false && !fieldErrors ? state.error.message : undefined}
        calm={state?.ok === false && state.error.code === "UNAVAILABLE"}
      />
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Pause
      </Button>
    </form>
  );
}
