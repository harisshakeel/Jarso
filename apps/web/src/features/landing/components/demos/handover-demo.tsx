import { StatusChip } from "@/components/brand";
import { beat, DemoCard, KeycapPicture, pounds, ScrollStage, scrollHint } from "./demo-parts";

const DUE = 10;
const SPLIT = 40;

/**
 * Step 01, played by scrolling: the split slides to 40% Save, then Hand over is pressed and the
 * allowance is handed over.
 */
export function HandoverDemo({ progress }: { progress: number }) {
  const slide = beat(progress, 0, 0.5);
  const saveShare = Math.round((slide * SPLIT) / 10) * 10;
  const pressed = progress >= 0.56 && progress < 0.72;
  const done = progress >= 0.72;
  const save = Math.round((DUE * saveShare) / 100);

  return (
    <ScrollStage
      label="Hand over a £10 allowance"
      hint={scrollHint(progress, "Handed over. Jarso keeps the record.")}
      done={progress >= 1}
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
        <div className="relative h-8">
          <span className="absolute inset-x-3 top-1/2 h-2 -translate-y-1/2 rounded-full bg-muted" />
          <span
            className="absolute top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-primary bg-card shadow-raised transition-[left]"
            style={{ left: `calc(0.75rem + ${saveShare / 100} * (100% - 1.5rem))` }}
          />
        </div>
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
        <KeycapPicture gold pressed={pressed} className="w-full">
          {done ? "Handed over" : "Hand over"}
        </KeycapPicture>
      </DemoCard>
    </ScrollStage>
  );
}
