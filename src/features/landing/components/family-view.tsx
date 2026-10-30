"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { JarsoMark, StatusChip } from "@/components/brand";
import { siteConfig } from "@/config";
import { landingCopy } from "../copy";
import { useInView } from "../hooks/use-in-view";
import { useTimeline } from "../hooks/use-timeline";
import { easeInOut, easeOut, easeOutBack, lerp, segment } from "../motion";
import { DemoCard, FloatingChip, KeycapPicture, pounds } from "./demos/demo-parts";
import { TwoBeat } from "./two-beat";

function Phone({ who, children }: { who: string; children: ReactNode }) {
  return (
    <div className="w-full max-w-[19rem] rounded-[2.5rem] border border-hairline-strong bg-card p-2.5 shadow-raised">
      <div className="grid min-h-[27rem] content-start gap-3 rounded-[2rem] bg-background p-4">
        <div className="flex items-center gap-2 pb-1">
          <JarsoMark size={24} />
          <span className="flex-1 font-extrabold text-primary">{siteConfig.name}</span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 font-semibold text-ink-2 text-xs">
            {who}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Spec §3.4. The parent's Home and the child's Home side by side (stacked on phones). The parent
 * taps "Hand over", a line draws across to the child's Save jar, a coin travels along it and Save
 * goes up. The line is measured from the two elements, so it follows any layout. The page thread
 * (jar-thread.tsx) swings to the right margin while this section passes (`data-thread-swing`).
 */
export function FamilyView() {
  const stage = useRef<HTMLDivElement>(null);
  const from = useRef<HTMLSpanElement>(null);
  const to = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState("");
  const play = useInView(stage, { threshold: 0.45 });
  const t = useTimeline(play, 2800);

  useEffect(() => {
    const box = stage.current;
    const start = from.current;
    const end = to.current;
    if (!box || !start || !end) return;
    const measure = () => {
      const c = box.getBoundingClientRect();
      const a = start.getBoundingClientRect();
      const b = end.getBoundingClientRect();
      const x1 = a.right - c.left;
      const y1 = a.top + a.height / 2 - c.top;
      if (b.left > a.right) {
        // Side by side: dip under the child's Spend jar and come up into Save from below.
        const x2 = b.left + b.width / 2 - c.left;
        const y2 = b.bottom - c.top;
        setPath(`M${x1} ${y1}C${(x1 + x2) / 2} ${y1 + 70} ${x2} ${y2 + 90} ${x2} ${y2}`);
      } else {
        // Stacked: loop round the right-hand side and into Save, clear of both screens.
        const x2 = b.right - c.left;
        const y2 = b.top + b.height / 2 - c.top;
        const out = Math.max(a.right, b.right) - c.left + 28;
        setPath(`M${x1} ${y1}C${out} ${y1} ${out} ${y2} ${x2} ${y2}`);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const pressed = t >= 300 && t < 480;
  const handedOver = t >= 500;
  const draw = easeInOut(segment(t, 500, 1300));
  const travel = easeInOut(segment(t, 1300, 2000));
  const coinShown = t >= 1300 && t < 2050;
  const save = lerp(18, 22, easeOut(segment(t, 2000, 2400)));
  const plus = easeOutBack(segment(t, 2000, 2300));

  return (
    <section
      aria-labelledby="family-title"
      data-thread-swing
      className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6"
    >
      <h2
        id="family-title"
        className="mx-auto max-w-3xl text-balance text-center font-extrabold text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl"
      >
        <TwoBeat beats={landingCopy.family.title} />
      </h2>
      <figure
        aria-label="On the parent's phone, the allowance is handed over. On the child's phone, Save goes from £18 to £22."
        className="mt-14"
      >
        <div
          ref={stage}
          aria-hidden
          className="pointer-events-none relative mx-auto grid max-w-3xl select-none justify-items-center gap-20 md:grid-cols-2 md:gap-28"
        >
          <Phone who="Parent">
            <p className="eyebrow">Needs you</p>
            <DemoCard className="grid gap-3">
              <div className="flex items-center gap-2">
                <p className="flex-1 font-bold">Mia's allowance</p>
                <StatusChip
                  status={handedOver ? "handedOver" : "due"}
                  label={handedOver ? undefined : "Due today"}
                />
              </div>
              <p className="money font-extrabold text-money-l">{pounds(10)}</p>
              <span ref={from} className="block">
                <KeycapPicture pressed={pressed} gold className="w-full">
                  Hand over
                </KeycapPicture>
              </span>
            </DemoCard>
            <DemoCard className="flex items-center gap-3 py-3 sm:py-3">
              <p className="flex-1 font-semibold">Mia's learning</p>
              <span className="text-ink-2 text-sm">Practised</span>
            </DemoCard>
          </Phone>

          <Phone who="Mia">
            <DemoCard className="grid gap-2">
              <p className="eyebrow">Next step</p>
              <p className="font-bold text-h3">Day 3. Saving first</p>
              <KeycapPicture pressed={false} className="w-fit">
                Start mission
              </KeycapPicture>
            </DemoCard>
            <div className="grid grid-cols-2 gap-3">
              <DemoCard>
                <p className="text-ink-2 text-sm">Spend</p>
                <p className="money font-extrabold text-2xl">{pounds(3)}</p>
              </DemoCard>
              <div ref={to} className="relative">
                <DemoCard>
                  <p className="text-ink-2 text-sm">Save</p>
                  <p className="money font-extrabold text-2xl">{pounds(save)}</p>
                </DemoCard>
                <FloatingChip shown={plus} className="-top-3 -right-2 text-gold-800 dark:text-gold">
                  +{pounds(4)}
                </FloatingChip>
              </div>
            </div>
          </Phone>

          {path ? (
            <svg className="absolute inset-0 size-full overflow-visible" aria-hidden>
              <path
                d={path}
                fill="none"
                strokeWidth={3}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="1 1"
                strokeDashoffset={1 - draw}
                className="stroke-gold-300"
              />
            </svg>
          ) : null}
          {path && coinShown ? (
            <span
              className="absolute top-0 left-0 size-6 rounded-full border-[3px] border-teal-800 bg-gold"
              style={{
                offsetPath: `path("${path}")`,
                offsetDistance: `${travel * 100}%`,
                offsetRotate: "0deg",
              }}
            />
          ) : null}
        </div>
      </figure>
    </section>
  );
}
