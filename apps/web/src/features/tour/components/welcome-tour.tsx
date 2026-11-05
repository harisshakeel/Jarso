"use client";

import { type CoachId, coachIds, coachNames } from "@jarso/core/learning";
import {
  buddyName,
  type TourStep,
  type TourTab,
  type TourTarget,
  tourCopy,
  tourLineId,
  tourSteps,
  tourVoice,
  tourVoicePath,
} from "@jarso/core/tour";
import { PointerIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CoachFigure, JarsoEyes } from "@/components/brand";
import { Button } from "@/components/ui";
import { routes } from "@/config";
import { setLessonBuddy } from "@/features/learning";
import { cn, playFanfare, playRight } from "@/lib";
import { saveTourAction } from "../server/actions";
import { onTourStart } from "./tour-store";
import { hush, sayLine, setTourMuted, tourMuted } from "./tour-voice";

const STEP_KEY = "jarso:tour-step";
const TOTAL = tourSteps.length;
const TABS: Record<TourTab, Route> = {
  diary: routes.childDiary,
  learn: routes.childLearn,
  jarso: routes.childJarso,
  inbox: routes.childInbox,
};
/** Room round the glowing thing, px. */
const PAD = 8;

type Rect = { top: number; left: number; width: number; height: number };

const on = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

function reducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readStep(): number {
  try {
    const saved = Number(window.sessionStorage.getItem(STEP_KEY));
    return Number.isInteger(saved) && saved > 0 && saved < TOTAL ? saved : 0;
  } catch {
    return 0;
  }
}

function writeStep(index: number | null): void {
  try {
    if (index === null) window.sessionStorage.removeItem(STEP_KEY);
    else window.sessionStorage.setItem(STEP_KEY, String(index));
  } catch {
    // Blocked storage: a refresh starts the tour from the top, which is fine.
  }
}

function save(input: { buddy?: CoachId; finished?: boolean }): void {
  void saveTourAction(null, input).catch(() => undefined);
}

/**
 * Finds the thing a step points at (`data-tour="…"`), brings it into view once, then follows it
 * every frame (it may move as the page streams in or scrolls). Null while it can't be found;
 * after a few seconds the step just carries on without a spotlight.
 */
function useTargetRect(target: TourTarget | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    setRect(null);
    if (!target) return;
    let frame = 0;
    let scrolled = false;
    let last = "";
    const started = performance.now();
    const tick = () => {
      const element = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`),
      ).find((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
      if (element) {
        if (!scrolled) {
          scrolled = true;
          element.scrollIntoView({
            block: "center",
            inline: "nearest",
            behavior: reducedMotion() ? "auto" : "smooth",
          });
        }
        const box = element.getBoundingClientRect();
        const next = {
          top: Math.round(box.top - PAD),
          left: Math.round(box.left - PAD),
          width: Math.round(box.width + PAD * 2),
          height: Math.round(box.height + PAD * 2),
        };
        const key = `${next.top}:${next.left}:${next.width}:${next.height}`;
        if (key !== last) {
          last = key;
          setRect(next);
        }
      } else if (performance.now() - started > 4000) {
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return rect;
}

/** The words appear as they are said (all at once under reduced motion). */
function useReveal(text: string, muted: boolean): number {
  const words = text.split(" ").length;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reducedMotion()) {
      setShown(words);
      return;
    }
    setShown(0);
    const each = muted ? 70 : 330;
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      setShown(count);
      if (count >= words) window.clearInterval(timer);
    }, each);
    return () => window.clearInterval(timer);
  }, [words, muted]);
  return shown;
}

/**
 * The child's welcome tour (2026-11-06, demo 3 feedback). Game-tutorial style: the screen dims,
 * one thing glows with a tapping hand, and the buddy the child picked hops in at the bottom
 * corner with a speech bubble that is read aloud. Home first, then the child taps each tab
 * themselves and the buddy explains it; Jarso pops in on its own tab; a shower of coins at the
 * end. Nothing changes money. Mounted once in the child layout so it lives across the tabs;
 * shows on the first visit (`show`), and again from Me.
 */
export function WelcomeTour({
  name,
  buddy: savedBuddy,
  show,
}: {
  name: string;
  buddy: CoachId | null;
  show: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [buddy, setBuddy] = useState<CoachId | null>(savedBuddy);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setMuted(tourMuted());
    if (!show) return;
    const timer = window.setTimeout(() => {
      setIndex(readStep());
      setOpen(true);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [show]);

  // The buddy coaches the lessons too, from the moment they are picked.
  useEffect(() => {
    setLessonBuddy(buddy);
  }, [buddy]);

  useEffect(
    () =>
      onTourStart(() => {
        setIndex(0);
        setOpen(true);
      }),
    [],
  );

  const step = tourSteps[index] as TourStep;
  const arrived = step.kind === "tap" && on(pathname, TABS[step.tab]);
  const atHome = pathname === routes.child;

  // Home's steps, the buddy pick and the finish happen on Home: go there if the child isn't.
  useEffect(() => {
    if (!open) return;
    writeStep(index);
    if (step.kind !== "tap" && !atHome) router.push(routes.child);
  }, [open, index, step.kind, atHome, router]);

  const close = useCallback(() => {
    hush();
    writeStep(null);
    setOpen(false);
  }, []);

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, TOTAL - 1)), []);

  const skip = useCallback(() => {
    save({ finished: true });
    close();
  }, [close]);

  const words = { name: name || "there", buddy: buddyName(buddy) };
  const speaker = step.kind === "tap" && arrived ? step.arrive.speaker : "buddy";
  const line =
    step.kind === "tap" ? (arrived ? step.arrive.say(words) : step.say(words)) : step.say(words);
  const target: TourTarget | null =
    step.kind === "say"
      ? step.target
      : step.kind === "tap"
        ? arrived
          ? step.arrive.target
          : step.target
        : null;

  // Read each bubble once, as it appears, in the speaker's recorded voice when there is one.
  const lineId = tourLineId(step, arrived);
  const voice = tourVoice(lineId, buddy);
  const clip = voice ? tourVoicePath(lineId, voice) : null;
  useEffect(() => {
    if (!open || muted) return;
    sayLine(line, speaker === "jarso" ? 1.15 : 1, clip);
  }, [open, muted, line, speaker, clip]);
  useEffect(() => () => hush(), []);

  // Escape skips, like the Skip button.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, skip]);

  // Home's things are only looked for on Home; a tab and the page it opens, wherever we are.
  const rect = useTargetRect(open && (step.kind !== "say" || atHome) ? target : null);
  const pointing = step.kind === "tap" && !arrived;

  // When the child is asked to tap a tab, the keyboard lands on it too.
  useEffect(() => {
    if (!open || !pointing || !rect || !target) return;
    document.querySelector<HTMLElement>(`[data-tour="${target}"]`)?.focus({ preventScroll: true });
  }, [open, pointing, rect, target]);

  if (!mounted || !open) return null;

  const toggleMute = () => {
    setTourMuted(!muted);
    setMuted(!muted);
  };

  let body: ReactNode;
  if (step.kind === "pick") {
    body = (
      <BuddyPicker
        line={line}
        onPick={(id) => {
          setBuddy(id);
          playRight();
          save({ buddy: id });
          window.setTimeout(next, 650);
        }}
      />
    );
  } else if (step.kind === "finish") {
    body = (
      <Finale
        line={line}
        buddy={buddy ?? "bo"}
        label={step.next}
        onDone={() => {
          save({ finished: true });
          close();
        }}
      />
    );
  } else {
    body = (
      <>
        <Spotlight rect={rect} pointing={pointing} />
        <Guide
          key={`${step.id}:${arrived ? "then" : "point"}`}
          line={line}
          speaker={speaker}
          buddy={buddy ?? "bo"}
          stepNumber={index + 1}
          muted={muted}
          onMute={toggleMute}
          onSkip={skip}
          nextLabel={pointing ? null : step.kind === "say" && step.next ? step.next : tourCopy.next}
          onNext={next}
          high={rect !== null && !pointing && rect.top + rect.height / 2 > window.innerHeight * 0.5}
        />
      </>
    );
  }

  return createPortal(
    <div data-slot="welcome-tour" className="pointer-events-none fixed inset-0 z-[60]">
      {body}
    </div>,
    document.body,
  );
}

/**
 * The dimmed screen with one lit hole. Outside the hole, taps are caught; inside, they reach the
 * page only while the child is asked to tap it (a tab), so nothing else can be pressed.
 */
function Spotlight({ rect, pointing }: { rect: Rect | null; pointing: boolean }) {
  if (!rect) {
    return (
      <div className="pointer-events-auto absolute inset-0 bg-black/60 motion-safe:animate-[fade-up_250ms_var(--ease-brand)_both]" />
    );
  }
  const hole: CSSProperties = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
  const below = rect.top + rect.height / 2 < window.innerHeight * 0.5;
  const rail = rect.left < 120 && rect.width < 280 && window.innerWidth >= 768;
  return (
    <>
      {/* Taps outside the hole are caught by four panes round it. */}
      <div
        className="pointer-events-auto absolute inset-x-0 top-0"
        style={{ height: Math.max(rect.top, 0) }}
      />
      <div
        className="pointer-events-auto absolute inset-x-0 bottom-0"
        style={{ top: rect.top + rect.height }}
      />
      <div
        className="pointer-events-auto absolute left-0"
        style={{ top: rect.top, height: rect.height, width: Math.max(rect.left, 0) }}
      />
      <div
        className="pointer-events-auto absolute right-0"
        style={{ top: rect.top, height: rect.height, left: rect.left + rect.width }}
      />
      {pointing ? null : <div className="pointer-events-auto absolute" style={hole} />}
      {/* The dim, cut round the hole, and the glowing ring. */}
      <div
        aria-hidden
        className="absolute rounded-2xl shadow-[0_0_0_200vmax_rgb(0_0_0/0.6)] ring-4 ring-gold transition-all duration-300 ease-[var(--ease-brand)] motion-reduce:transition-none"
        style={hole}
      />
      <div
        aria-hidden
        className="absolute rounded-2xl ring-4 ring-gold motion-safe:animate-[tour-glow_1.4s_ease-out_infinite] motion-reduce:hidden"
        style={hole}
      />
      {pointing ? (
        <span
          aria-hidden
          className="absolute"
          style={
            rail
              ? { top: rect.top + rect.height / 2 - 24, left: rect.left + rect.width + 4 }
              : below
                ? { top: rect.top + rect.height + 4, left: rect.left + rect.width / 2 - 20 }
                : { top: rect.top - 56, left: rect.left + rect.width / 2 - 20 }
          }
        >
          <PointerIcon
            className={cn(
              "size-12 fill-white stroke-[1.5] text-teal-900 drop-shadow-lg motion-safe:animate-[tour-tap_900ms_ease-in-out_infinite]",
              rail ? "-rotate-90" : below ? "" : "rotate-180",
            )}
          />
        </span>
      ) : null}
    </>
  );
}

/** The buddy (or Jarso) at the bottom corner with the speech bubble. */
function Guide({
  line,
  speaker,
  buddy,
  stepNumber,
  muted,
  onMute,
  onSkip,
  nextLabel,
  onNext,
  high,
}: {
  line: string;
  speaker: "buddy" | "jarso";
  buddy: CoachId;
  stepNumber: number;
  muted: boolean;
  onMute: () => void;
  onSkip: () => void;
  /** Null while the child is asked to tap something themselves. */
  nextLabel: string | null;
  onNext: () => void;
  /** The glowing thing is low on the screen: the guide stands at the top instead. */
  high: boolean;
}) {
  const shown = useReveal(line, muted);
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, []);
  const words = line.split(" ");
  return (
    <section
      aria-label={tourCopy.label}
      className={cn(
        "pointer-events-auto fixed right-3 left-3 flex items-end gap-2 sm:right-auto sm:gap-3 md:left-28 lg:left-[17.5rem]",
        high ? "top-3 md:top-6" : "bottom-[5.5rem] md:bottom-6",
      )}
    >
      <div className="shrink-0 motion-safe:animate-[tour-hop-in_600ms_var(--ease-brand)_both]">
        {speaker === "jarso" ? (
          <JarsoEyes size="xl" look="ahead" className="h-24 w-24 sm:h-32 sm:w-32" />
        ) : (
          <CoachFigure coach={buddy} size={150} reaction="cheer" className="h-28 w-auto sm:h-40" />
        )}
      </div>
      <div className="relative mb-6 grid w-full max-w-md gap-3 rounded-3xl border-2 border-gold/60 bg-card p-4 shadow-raised motion-safe:animate-[tour-pop_350ms_var(--ease-brand)_120ms_both] sm:p-5">
        <span
          aria-hidden
          className="absolute bottom-6 -left-2 size-4 rotate-45 border-gold/60 border-b-2 border-l-2 bg-card"
        />
        <p className="eyebrow text-gold-text">
          {speaker === "jarso" ? tourCopy.jarso : coachNames[buddy]}
        </p>
        <p aria-live="polite" className="sr-only">
          {line}
        </p>
        <p
          aria-hidden
          className="min-h-[3.5rem] text-balance font-bold text-lg leading-snug sm:text-xl"
        >
          {words.map((word, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: words repeat; their place is their identity.
              key={i}
              className={cn(
                "transition-opacity duration-200",
                i < shown ? "opacity-100" : "opacity-0",
              )}
            >
              {word}{" "}
            </span>
          ))}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm tabular-nums">
            {tourCopy.step(stepNumber, TOTAL)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onMute}
            aria-label={muted ? tourCopy.unmute : tourCopy.mute}
            aria-pressed={muted}
          >
            {muted ? <VolumeXIcon aria-hidden /> : <Volume2Icon aria-hidden />}
          </Button>
          <span className="flex-1" />
          <Button type="button" variant="ghost" onClick={onSkip}>
            {tourCopy.skip}
          </Button>
          {nextLabel ? (
            <Button ref={nextRef} type="button" variant="keycap" size="lg" onClick={onNext}>
              {nextLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** The four kids line up; tapping one makes them the child's buddy. */
function BuddyPicker({ line, onPick }: { line: string; onPick: (id: CoachId) => void }) {
  const [picked, setPicked] = useState<CoachId | null>(null);
  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center overflow-y-auto bg-black/60 p-4">
      <section
        aria-label={tourCopy.label}
        className="grid w-full max-w-3xl justify-items-center gap-6"
      >
        <p className="text-balance rounded-3xl border-2 border-gold/60 bg-card px-6 py-4 text-center font-extrabold text-h2 shadow-raised motion-safe:animate-[tour-pop_400ms_var(--ease-brand)_both]">
          {line}
        </p>
        <ul className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {coachIds.map((id, i) => (
            <li key={id} className="rise-in" style={{ "--rise-index": i + 1 } as CSSProperties}>
              <button
                type="button"
                disabled={picked !== null}
                onClick={() => {
                  setPicked(id);
                  onPick(id);
                }}
                aria-label={tourCopy.pickLabel(coachNames[id])}
                className={cn(
                  "group grid w-full justify-items-center gap-2 rounded-3xl border-2 bg-card px-3 pt-5 pb-3 shadow-rest transition-all duration-200 ease-[var(--ease-brand)]",
                  "hover:-translate-y-1 hover:border-gold hover:shadow-raised focus-visible:border-gold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/40",
                  picked === id && "scale-105 border-gold ring-4 ring-gold/50",
                  picked !== null && picked !== id && "scale-95 opacity-40",
                )}
              >
                <CoachFigure
                  coach={id}
                  size={130}
                  reaction={picked === id ? "cheer" : null}
                  className="h-28 w-auto group-hover:motion-safe:animate-[coach-cheer_700ms_var(--ease-brand)] sm:h-32"
                />
                <span className="font-extrabold text-lg">{coachNames[id]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Coins rain, the buddy cheers, and Let's go closes the tour on Home. */
function Finale({
  line,
  buddy,
  label,
  onDone,
}: {
  line: string;
  buddy: CoachId;
  label: string;
  onDone: () => void;
}) {
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    playFanfare();
    doneRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="pointer-events-auto absolute inset-0 grid place-items-center overflow-hidden bg-black/60 p-4">
      <div aria-hidden className="motion-reduce:hidden">
        {Array.from({ length: 18 }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed shower of identical coins.
            key={i}
            className="absolute top-0 size-7 rounded-full border-4 border-teal-800 bg-gold motion-safe:animate-[tour-coin-rain_2.4s_ease-in_both]"
            style={
              {
                left: `${(i * 37) % 100}%`,
                animationDelay: `${(i % 6) * 0.18}s`,
                "--drift": `${((i % 5) - 2) * 30}px`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <section
        aria-label={tourCopy.label}
        className="relative grid w-full max-w-md justify-items-center gap-5 text-center motion-safe:animate-[tour-pop_450ms_var(--ease-brand)_both]"
      >
        <CoachFigure coach={buddy} size={200} reaction="cheer" className="h-44 w-auto sm:h-52" />
        <p
          aria-live="polite"
          className="text-balance rounded-3xl border-2 border-gold/60 bg-card px-6 py-5 font-extrabold text-h2 shadow-raised"
        >
          {line}
        </p>
        <Button
          ref={doneRef}
          type="button"
          variant="keycap"
          size="xl"
          className="min-w-44"
          onClick={onDone}
        >
          {label}
        </Button>
      </section>
    </div>
  );
}
