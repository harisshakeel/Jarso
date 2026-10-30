"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui";
import { runOnline } from "@/features/offline";
import { undoPurchaseAction } from "../server/actions";

/** Takes a purchase back (within 24 hours). Recording it again is always possible. */
export function UndoButton({ entryId, label }: { entryId: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ code: string; message: string }>();

  function undo() {
    setError(undefined);
    start(async () => {
      const result = await runOnline(() => undoPurchaseAction(null, { entryId }));
      if (!result.ok) {
        setError(result.error);
      } else {
        toast.success("Undone. The money is back in Spend.");
      }
    });
  }

  return (
    <div className="grid justify-items-end">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Undo ${label}`}
        loading={pending}
        onClick={undo}
      >
        Undo
      </Button>
      <FormError error={error} />
    </div>
  );
}
