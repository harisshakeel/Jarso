import { CircleCheckIcon } from "lucide-react";
import { cn } from "@/lib";
import { DemoCard, KeycapPicture, ScrollStage, scrollHint } from "./demo-parts";

const OPTIONS = ["Spend all £8 today", "Spend £5, save £3", "Spend £8 now, save later"];
const RIGHT = 1;

/**
 * Step 04, played by scrolling: the saving-first plan gets picked, Check is pressed, and the
 * skill moves up to Practised.
 */
export function MissionDemo({ progress }: { progress: number }) {
  const picked = progress >= 0.3 ? RIGHT : null;
  const pressed = progress >= 0.56 && progress < 0.7;
  const done = progress >= 0.7;
  const practised = progress >= 0.86;

  return (
    <ScrollStage
      label="A mission step"
      hint={scrollHint(progress, "That's it. The skill moved up to Practised.")}
      done={progress >= 1}
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
        <div className="grid gap-2">
          {OPTIONS.map((option, index) => {
            const chosen = picked === index;
            return (
              <span
                key={option}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl border px-4 py-2.5 font-semibold transition-colors",
                  chosen ? "border-primary bg-secondary" : "border-hairline-strong bg-card",
                )}
              >
                <span
                  className={cn(
                    "grid size-5 place-items-center rounded-full border-2",
                    chosen ? "border-primary" : "border-hairline-strong",
                  )}
                >
                  {chosen ? <span className="size-2.5 rounded-full bg-primary" /> : null}
                </span>
                {option}
              </span>
            );
          })}
        </div>
        {done ? (
          <div className="grid gap-1 rounded-xl bg-teal-100 p-4 text-teal-800 motion-safe:animate-[rise-in_250ms_var(--ease-brand)_both] dark:bg-teal-900 dark:text-teal-100">
            <p className="flex items-center gap-2 font-bold text-lg">
              <CircleCheckIcon aria-hidden className="size-6" />
              That's it.
            </p>
            <p>£3 goes to Save before anything is spent.</p>
          </div>
        ) : (
          <KeycapPicture
            pressed={pressed}
            className={cn("w-full", picked === null && "opacity-50")}
          >
            Check
          </KeycapPicture>
        )}
      </DemoCard>
      <DemoCard className="flex items-center gap-3 py-3 sm:py-3">
        <p className="flex-1 font-bold">Saving first</p>
        <span className="font-semibold text-ink-2">{practised ? "Practised" : "Started"}</span>
        <span className="flex gap-1">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className={cn(
                "size-2.5 rounded-full transition-colors duration-300",
                dot < (practised ? 2 : 1) ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </span>
      </DemoCard>
    </ScrollStage>
  );
}
