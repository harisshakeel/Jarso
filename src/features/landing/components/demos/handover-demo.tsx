"use client";

import { StatusChip } from "@/components/brand";
import { useTimeline } from "../../hooks/use-timeline";
import { easeInOut, lerp, segment } from "../../motion";
import { DemoCard, DemoStage, KeycapPicture, pounds } from "./demo-parts";

const DUE = 10;

/** Step 01: the parent's handover. The split slides from half and half to £6 and £4, then hand over. */
export function HandoverDemo({ play }: { play: boolean }) {
  const t = useTimeline(play, 2400);
  const saveShare = lerp(50, 40, easeInOut(segment(t, 400, 1200)));
  const save = (DUE * saveShare) / 100;
  const pressed = t >= 1500 && t < 1700;
  const done = t >= 1750;

  return (
    <DemoStage label="A parent hands over a £10 allowance: £6 to Spend as cash, £4 kept in Save.">
      <DemoCard className="grid gap-1">
        <div className="flex items-center gap-2">
          <p className="flex-1 font-bold">Weekly allowance</p>
          <StatusChip status={done ? "handedOver" : "due"} label={done ? undefined : "Due today"} />
        </div>
        <p className="money font-extrabold text-3xl">{pounds(DUE)}</p>
      </DemoCard>
      <DemoCard className="grid gap-5">
        <div className="flex h-4 overflow-hidden rounded-full bg-muted">
          <div className="bg-teal-600" style={{ width: `${100 - saveShare}%` }} />
          <div className="bg-gold-300" style={{ width: `${saveShare}%` }} />
        </div>
        <div className="relative h-5">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
          <div
            className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card shadow-rest"
            style={{ left: `${saveShare}%` }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-teal-100 p-3 text-teal-800 dark:bg-teal-900 dark:text-teal-100">
            <p className="font-semibold text-sm">Spend (cash)</p>
            <p className="money font-extrabold text-2xl">{pounds(DUE - save)}</p>
          </div>
          <div className="rounded-xl bg-gold-100 p-3 text-gold-800 dark:bg-gold-900 dark:text-gold">
            <p className="font-semibold text-sm">Save (you keep)</p>
            <p className="money font-extrabold text-2xl">{pounds(save)}</p>
          </div>
        </div>
        <KeycapPicture pressed={pressed} gold className="w-full">
          Hand over
        </KeycapPicture>
      </DemoCard>
    </DemoStage>
  );
}
