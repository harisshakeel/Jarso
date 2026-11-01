"use client";

import { useState } from "react";
import { StatusChip } from "@/components/brand";
import { Button } from "@/components/ui";
import { DemoCard, LiveStage, pounds } from "./demo-parts";

const DUE = 10;

/** Step 01, playable: drag the split, then hand over. */
export function HandoverDemo({ onDone }: { onDone: () => void }) {
  const [saveShare, setSaveShare] = useState(40);
  const [done, setDone] = useState(false);
  const save = Math.round((DUE * saveShare) / 100);

  return (
    <LiveStage
      label="Hand over a £10 allowance"
      hint={done ? "Handed over. Jarso keeps the record." : "Drag the split, then tap Hand over."}
      done={done}
    >
      <DemoCard className="grid gap-1">
        <div className="flex items-center gap-2">
          <p className="flex-1 font-bold">Weekly allowance</p>
          <StatusChip status={done ? "handedOver" : "due"} label={done ? undefined : "Due today"} />
        </div>
        <p className="money font-extrabold text-3xl">{pounds(DUE)}</p>
      </DemoCard>
      <DemoCard className="grid gap-5">
        <div className="flex h-4 overflow-hidden rounded-full bg-muted">
          <div
            className="bg-teal-600 transition-[width]"
            style={{ width: `${100 - saveShare}%` }}
          />
          <div className="bg-gold-300 transition-[width]" style={{ width: `${saveShare}%` }} />
        </div>
        <label className="grid gap-1">
          <span className="sr-only">Share kept in Save</span>
          <input
            type="range"
            min={0}
            max={100}
            step={10}
            value={saveShare}
            disabled={done}
            onChange={(event) => setSaveShare(Number(event.target.value))}
            className="h-11 w-full accent-[var(--color-primary)]"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-teal-100 p-3 text-teal-800 dark:bg-teal-900 dark:text-teal-100">
            <p className="font-semibold">Spend (cash)</p>
            <p className="money font-extrabold text-2xl">{pounds(DUE - save)}</p>
          </div>
          <div className="rounded-xl bg-gold-100 p-3 text-gold-800 dark:bg-gold-900 dark:text-gold">
            <p className="font-semibold">Save (you keep)</p>
            <p className="money font-extrabold text-2xl">{pounds(save)}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="keycap-gold"
          size="lg"
          className="w-full"
          disabled={done}
          onClick={() => {
            setDone(true);
            onDone();
          }}
        >
          {done ? "Handed over" : "Hand over"}
        </Button>
      </DemoCard>
    </LiveStage>
  );
}
