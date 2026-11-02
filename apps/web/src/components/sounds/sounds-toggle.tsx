"use client";

import { Volume2Icon } from "lucide-react";
import { useId } from "react";
import { Switch } from "@/components/ui";
import { playCoins } from "@/lib/sounds";
import { useSounds } from "./use-sounds";

/**
 * One switch for Jarso's sounds (coins when money moves, a chime or a bonk after an answer),
 * on Settings for the child and the parent. The choice lives in this browser. Turning it on
 * plays the coins once, so the person hears what they chose.
 */
export function SoundsToggle() {
  const { on, setOn } = useSounds();
  const labelId = useId();
  const hintId = useId();
  return (
    <div className="flex items-start gap-3 rounded-xl border border-hairline bg-card p-4">
      <Volume2Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-2" />
      <div className="grid flex-1 gap-1">
        <span id={labelId} className="font-semibold">
          Sounds
        </span>
        <p id={hintId} className="text-ink-2 text-sm">
          {on
            ? "Coins clink when money moves, and answers chime."
            : "Jarso is quiet on this device."}
        </p>
      </div>
      <Switch
        aria-labelledby={labelId}
        aria-describedby={hintId}
        checked={on}
        onCheckedChange={(checked) => {
          setOn(checked);
          if (checked) playCoins();
        }}
      />
    </div>
  );
}
