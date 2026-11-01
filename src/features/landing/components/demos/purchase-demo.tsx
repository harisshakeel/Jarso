"use client";

import { CircleCheckIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { cn } from "@/lib";
import { DemoCard, LiveStage, pounds } from "./demo-parts";

const SPEND = 6;

/** Step 02, playable: say what you bought and how much, then record it. */
export function PurchaseDemo({ onDone }: { onDone: () => void }) {
  const id = useId();
  const [label, setLabel] = useState("Comic");
  const [amount, setAmount] = useState("3");
  const [done, setDone] = useState(false);
  const cost = Math.min(SPEND, Math.max(0, Math.round(Number(amount) || 0)));
  const canRecord = !done && label.trim().length > 0 && cost > 0;

  return (
    <LiveStage
      label="Record a purchase"
      hint={
        done
          ? "Written down. Spend went down, inside the rules."
          : "Type what you bought, then tap Record it."
      }
      done={done}
    >
      <DemoCard className="flex items-baseline justify-between">
        <p className="font-semibold text-ink-2">Spend</p>
        <p className="money font-extrabold text-3xl">{pounds(done ? SPEND - cost : SPEND)}</p>
      </DemoCard>
      <DemoCard className="grid gap-4">
        <p className="font-bold text-h3">Record a purchase</p>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-what`}>What for?</Label>
            <Input
              id={`${id}-what`}
              value={label}
              disabled={done}
              maxLength={24}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-amount`}>How much?</Label>
            <Input
              id={`${id}-amount`}
              inputMode="numeric"
              value={amount}
              disabled={done}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, "").slice(0, 1))}
            />
          </div>
        </div>
        <Button
          type="button"
          variant="keycap"
          size="lg"
          className="w-full"
          disabled={!canRecord}
          onClick={() => {
            setDone(true);
            onDone();
          }}
        >
          {done ? "Recorded" : "Record it"}
        </Button>
      </DemoCard>
      <div className="relative">
        <DemoCard
          className={cn(
            "flex items-center gap-3 py-3 transition-opacity sm:py-3",
            done ? "opacity-100" : "opacity-40",
          )}
        >
          <div className="flex-1">
            <p className="font-bold">{done ? label.trim() : "…"}</p>
            <p className="text-ink-2">Today</p>
          </div>
          <p className="money font-bold text-money">{done ? pounds(cost) : ""}</p>
        </DemoCard>
        {done ? (
          <span className="absolute -top-4 right-3 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 font-bold text-sm text-teal-800 shadow-raised motion-safe:animate-[badge-in_400ms_var(--ease-brand)_both] dark:text-teal-100">
            <CircleCheckIcon aria-hidden className="size-4" />
            Within your rules
          </span>
        ) : null}
      </div>
    </LiveStage>
  );
}
