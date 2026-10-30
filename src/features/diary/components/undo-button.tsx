"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { runOnline } from "@/features/offline";
import { undoPurchaseAction } from "../server/actions";

/** Takes a purchase back (within 24 hours). Recording it again is always possible. */
export function UndoButton({ entryId, label }: { entryId: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ text: string; calm: boolean }>();

  function undo() {
    setError(undefined);
    start(async () => {
      const result = await runOnline(() => undoPurchaseAction(null, { entryId }));
      if (!result.ok) {
        setError({ text: result.error.message, calm: result.error.code === "UNAVAILABLE" });
      } else {
        toast.success("Undone. The money is back in Spend.");
      }
    });
  }

  return (
    <span className="grid justify-items-end">
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
      {error ? (
        <span
          role={error.calm ? "status" : "alert"}
          className={error.calm ? "text-ink-2 text-sm" : "text-destructive text-sm"}
        >
          {error.text}
        </span>
      ) : null}
    </span>
  );
}
