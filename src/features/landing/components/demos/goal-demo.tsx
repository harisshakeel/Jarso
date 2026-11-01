import { beat, DemoCard, KeycapPicture, pounds, ScrollStage, scrollHint } from "./demo-parts";

const GOAL = 40;
const BEFORE = 18;
const WEEK = 4;

/**
 * Step 03, played by scrolling: the week's £4 button is pressed and the ring fills from £18 to
 * £22 of the £40 goal.
 */
export function GoalDemo({ progress }: { progress: number }) {
  const pressed = progress >= 0.22 && progress < 0.36;
  const fill = beat(progress, 0.36, 0.9);
  const saved = BEFORE + WEEK * fill;
  const added = progress >= 0.36;

  return (
    <ScrollStage
      label="A savings goal"
      hint={scrollHint(progress, "Closer. About five more allowances to go.")}
      done={progress >= 1}
    >
      <DemoCard className="grid justify-items-center gap-4 py-6 text-center sm:py-8">
        <div className="grid gap-1">
          <p className="eyebrow">Goal</p>
          <p className="font-extrabold text-h2">Football boots</p>
        </div>
        <div className="relative size-44">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
            <circle
              cx={60}
              cy={60}
              r={50}
              fill="none"
              strokeWidth={12}
              className="stroke-teal-100 dark:stroke-teal-900"
            />
            <circle
              cx={60}
              cy={60}
              r={50}
              fill="none"
              strokeWidth={12}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${(saved / GOAL) * 100} 100`}
              className="stroke-gold"
            />
          </svg>
          <div className="absolute inset-0 grid place-content-center">
            <p className="money font-extrabold text-money-l">{pounds(saved)}</p>
            <p className="text-ink-2">of {pounds(GOAL)}</p>
          </div>
        </div>
        <KeycapPicture gold pressed={pressed}>
          {added ? `+${pounds(WEEK)} saved` : `Add this week's ${pounds(WEEK)}`}
        </KeycapPicture>
      </DemoCard>
    </ScrollStage>
  );
}
