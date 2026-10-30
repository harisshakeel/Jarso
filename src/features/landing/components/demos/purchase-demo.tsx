"use client";

import { CircleCheckIcon } from "lucide-react";
import { cn } from "@/lib";
import { useTimeline } from "../../hooks/use-timeline";
import { easeOut, easeOutBack, lerp, segment, typed } from "../../motion";
import { DemoCard, DemoStage, FloatingChip, KeycapPicture, pounds } from "./demo-parts";

const LABEL = "Comic";
const AMOUNT = "3";

function FieldPicture({ label, value, typing }: { label: string; value: string; typing: boolean }) {
  return (
    <div className="grid gap-1.5">
      <p className="font-semibold text-sm">{label}</p>
      <div
        className={cn(
          "flex h-11 items-center rounded-xl border bg-card px-3 font-semibold",
          typing ? "border-primary" : "border-input",
        )}
      >
        {value}
        {typing ? <span className="ml-0.5 h-5 w-0.5 animate-pulse bg-primary" /> : null}
      </div>
    </div>
  );
}

/** Step 02: the child records a comic for £3; Spend goes from £6 to £3 and a diary row lands. */
export function PurchaseDemo({ play }: { play: boolean }) {
  const t = useTimeline(play, 2600);
  const label = typed(LABEL, t, 250, 60);
  const amount = typed(AMOUNT, t, 750, 60);
  const pressed = t >= 1150 && t < 1350;
  const row = easeOut(segment(t, 1450, 1750));
  const spend = lerp(6, 3, easeOut(segment(t, 1500, 1900)));
  const chip = easeOutBack(segment(t, 1900, 2200));

  return (
    <DemoStage label="A child records a £3 comic. Spend goes from £6 to £3, inside the rules their parent set.">
      <DemoCard className="flex items-baseline justify-between">
        <p className="font-semibold text-ink-2">Spend</p>
        <p className="money font-extrabold text-3xl">{pounds(spend)}</p>
      </DemoCard>
      <DemoCard className="grid gap-4">
        <p className="font-bold text-h3">Record a purchase</p>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <FieldPicture label="What for?" value={label} typing={t > 150 && t < 700} />
          <FieldPicture
            label="How much?"
            value={amount ? `£${amount}` : ""}
            typing={t >= 700 && t < 1100}
          />
        </div>
        <KeycapPicture pressed={pressed} className="w-full">
          Record it
        </KeycapPicture>
      </DemoCard>
      <div className="relative">
        <DemoCard className="flex items-center gap-3 py-3 sm:py-3">
          {/* The diary row slides up into place once the purchase is recorded. */}
          <div className="flex-1" style={{ opacity: row, translate: `0 ${(1 - row) * 12}px` }}>
            <p className="font-bold">{LABEL}</p>
            <p className="text-ink-2 text-sm">Today</p>
          </div>
          <p className="money font-bold text-money" style={{ opacity: row }}>
            −{pounds(3)}
          </p>
        </DemoCard>
        <FloatingChip shown={chip} className="-top-4 right-3 text-teal-800 dark:text-teal-100">
          <CircleCheckIcon aria-hidden className="size-4" />
          Within your rules
        </FloatingChip>
      </div>
    </DemoStage>
  );
}
