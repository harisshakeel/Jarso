import { CircleCheckIcon } from "lucide-react";
import { cn } from "@/lib";
import {
  beat,
  DemoCard,
  FieldPicture,
  FloatingChip,
  KeycapPicture,
  pounds,
  ScrollStage,
  scrollHint,
  typed,
} from "./demo-parts";

const SPEND = 6;
const WHAT = "Comic";
const COST = 3;

/**
 * Step 02, played by scrolling: "Comic" and "3" are typed, Record it is pressed, and the purchase
 * lands in today's list with Spend down by £3.
 */
export function PurchaseDemo({ progress }: { progress: number }) {
  const what = typed(WHAT, beat(progress, 0.04, 0.4));
  const much = typed(String(COST), beat(progress, 0.46, 0.54));
  const typingWhat = progress > 0 && progress < 0.46;
  const typingMuch = progress >= 0.46 && progress < 0.62;
  const pressed = progress >= 0.62 && progress < 0.74;
  const done = progress >= 0.74;
  const badge = beat(progress, 0.8, 1);

  return (
    <ScrollStage
      label="Record a purchase"
      hint={scrollHint(progress, "Written down. Spend went down, inside the rules.")}
      done={progress >= 1}
    >
      <DemoCard className="flex items-baseline justify-between">
        <p className="font-semibold text-ink-2">Spend</p>
        <p className="money font-extrabold text-3xl">{pounds(done ? SPEND - COST : SPEND)}</p>
      </DemoCard>
      <DemoCard className="grid gap-4">
        <p className="font-bold text-h3">Record a purchase</p>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <FieldPicture label="What for?" value={what} typing={typingWhat} />
          <FieldPicture label="How much?" value={much} typing={typingMuch} />
        </div>
        <KeycapPicture pressed={pressed} className="w-full">
          {done ? "Recorded" : "Record it"}
        </KeycapPicture>
      </DemoCard>
      <div className="relative">
        <DemoCard
          className={cn(
            "flex items-center gap-3 py-3 transition-opacity sm:py-3",
            done ? "opacity-100" : "opacity-40",
          )}
        >
          <div className="flex-1">
            <p className="font-bold">{done ? WHAT : "…"}</p>
            <p className="text-ink-2">Today</p>
          </div>
          <p className="money font-bold text-money">{done ? pounds(COST) : ""}</p>
        </DemoCard>
        <FloatingChip shown={badge} className="-top-4 right-3 text-teal-800 dark:text-teal-100">
          <CircleCheckIcon aria-hidden className="size-4" />
          Within your rules
        </FloatingChip>
      </div>
    </ScrollStage>
  );
}
