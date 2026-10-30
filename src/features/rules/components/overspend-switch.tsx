"use client";

import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Label, Switch } from "@/components/ui";
import { setOverspendAction } from "../server/actions";

type OverspendSwitchProps = { childId: string; nickname: string; allowed: boolean };

/** Lets the parent decide if Spend may go below zero (default off). */
export function OverspendSwitch({ childId, nickname, allowed }: OverspendSwitchProps) {
  const [checked, setChecked] = useState(allowed);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  function change(next: boolean) {
    setChecked(next);
    setError(undefined);
    start(async () => {
      const result = await setOverspendAction(null, { childId, allowed: next });
      if (!result.ok) {
        setChecked(!next);
        setError(result.error.message);
      }
    });
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="overspend">Let {nickname}'s Spend go below zero</Label>
        <Switch id="overspend" checked={checked} disabled={pending} onCheckedChange={change} />
      </div>
      <p className="text-ink-2 text-sm">
        {checked
          ? `${nickname} can record a purchase even if Spend is short.`
          : `${nickname} can only spend what is in Spend.`}
      </p>
      <FormError message={error} />
    </div>
  );
}
