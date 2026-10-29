"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { undoPurchaseAction } from "../server/actions";

/** Takes a purchase back (within 24 hours). Recording it again is always possible. */
export function UndoButton({ entryId }: { entryId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  function undo() {
    setError(undefined);
    start(async () => {
      const result = await undoPurchaseAction(null, { entryId });
      if (!result.ok) {
        setError(result.error.message);
      } else if (result.data === "too_late") {
        setError("It's too late to undo this one.");
      } else {
        toast.success("Undone. The money is back in Spend.");
      }
    });
  }

  return (
    <span className="grid justify-items-end">
      <Button type="button" variant="ghost" size="sm" loading={pending} onClick={undo}>
        Undo
      </Button>
      {error ? (
        <span role="alert" className="text-destructive text-sm">
          {error}
        </span>
      ) : null}
    </span>
  );
}
