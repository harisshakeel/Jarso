"use client";

import { CircleCheckIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib";
import { DemoCard, LiveStage } from "./demo-parts";

const OPTIONS = ["Spend all £8 today", "Spend £5, save £3", "Spend £8 now, save later"];
const RIGHT = 1;

/** Step 04, playable: pick a plan and check it; the right one moves the skill up. */
export function MissionDemo({ onDone }: { onDone: () => void }) {
  const name = useId();
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState<"right" | "wrong" | null>(null);
  const done = checked === "right";

  function check() {
    if (picked === null) return;
    const right = picked === RIGHT;
    setChecked(right ? "right" : "wrong");
    if (right) onDone();
  }

  return (
    <LiveStage
      label="A mission step"
      hint={
        done
          ? "That's it. The skill moved up to Practised."
          : checked === "wrong"
            ? "Have another go. Which plan saves first?"
            : "Pick a plan, then tap Check."
      }
      done={done}
    >
      <DemoCard className="grid gap-4">
        <div className="grid gap-2">
          <p className="eyebrow">Step 3 of 7</p>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4, 5, 6].map((dot) => (
              <span
                key={dot}
                className={cn("h-2 flex-1 rounded-full", dot < 3 ? "bg-primary" : "bg-muted")}
              />
            ))}
          </div>
        </div>
        <p className="text-balance font-bold text-h3">
          You have £8. Which plan leaves something for Save?
        </p>
        <fieldset className="grid gap-2" disabled={done}>
          <legend className="sr-only">Plans</legend>
          {OPTIONS.map((option, index) => {
            const chosen = picked === index;
            return (
              <label
                key={option}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 font-semibold transition-colors",
                  chosen ? "border-primary bg-secondary" : "border-hairline-strong bg-card",
                )}
              >
                <input
                  type="radio"
                  name={name}
                  checked={chosen}
                  onChange={() => {
                    setPicked(index);
                    setChecked(null);
                  }}
                  className="size-5 accent-[var(--color-primary)]"
                />
                {option}
              </label>
            );
          })}
        </fieldset>
        {done ? (
          <div className="grid gap-1 rounded-xl bg-teal-100 p-4 text-teal-800 motion-safe:animate-[rise-in_250ms_var(--ease-brand)_both] dark:bg-teal-900 dark:text-teal-100">
            <p className="flex items-center gap-2 font-bold text-lg">
              <CircleCheckIcon aria-hidden className="size-6" />
              That's it.
            </p>
            <p>£3 goes to Save before anything is spent.</p>
          </div>
        ) : (
          <Button
            type="button"
            variant="keycap"
            size="lg"
            className="w-full"
            disabled={picked === null}
            onClick={check}
          >
            Check
          </Button>
        )}
      </DemoCard>
      <DemoCard className="flex items-center gap-3 py-3 sm:py-3">
        <p className="flex-1 font-bold">Saving first</p>
        <span className="font-semibold text-ink-2">{done ? "Practised" : "Started"}</span>
        <span className="flex gap-1">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className={cn(
                "size-2.5 rounded-full transition-colors duration-300",
                dot < (done ? 2 : 1) ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </span>
      </DemoCard>
    </LiveStage>
  );
}
