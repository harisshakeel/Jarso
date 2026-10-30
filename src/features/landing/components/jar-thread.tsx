"use client";

import { useEffect, useRef } from "react";
import { JAR_OUTLINE_LENGTH, JAR_SEGMENTS } from "../jar-outline";
import { clamp01, easeInOut, lerp, segment } from "../motion";
import { JAR, UNWIND_START } from "./hero-scene";

// The thread: the hero jar's outline travelling through the page, drawn the way the jar is drawn
// in act 1. It is never a trail. One path runs from the hero jar to the closing jar:
//
//   the hero jar's outline backwards (from the top of the right side, down, along the bottom, up
//   the left to the curl) → a curve out of the curl → the How it works line beside 01–04 → down
//   the left margin, across to the right margin while the parent and child phones pass, and back
//   → a curve into the closing jar's curl → the closing jar's outline.
//
// Only a stretch of it shows, always as thick as the hero jar's stroke, and the scroll slides that
// stretch along the path. When the hero ends, the stretch is the whole jar; it crawls out of the
// curl and lands as the How it works line, which takes over while you read the steps. When How it
// works ends, the line leaves: the stretch slides down the margin, its head held at one height on
// screen, and grows back into a whole outline as it draws the closing jar, which then takes over
// and drops its coins. Scrolling back reverses all of it.
//
// The stroke's width is published as --thread-width, so the How it works line and the closing
// jar are drawn at the same thickness. Reduced motion: no thread; both show as they are.

type Point = { x: number; y: number };
const at = ({ x, y }: Point) => `${x.toFixed(1)} ${y.toFixed(1)}`;

/** Radius of the corner where the thread turns from the margin toward the closing jar. */
const TURN = 48;
/** Half the height of each S-curve where the thread crosses to the other margin and back. */
const BEND = 80;
/** Scroll each crossing takes, per pixel of its length: slow enough to watch it cross. */
const CROSSING_PACE = 0.55;

/** The How it works line that is showing at this width (the desktop rail or the phone route). */
function visibleTarget(): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>("[data-thread-target]")) {
    if (element.getClientRects().length > 0) return element;
  }
  return null;
}

/** The outline as path segments mapped to the screen, forwards or backwards (no move command). */
function outlineSegments(toScreen: (point: readonly [number, number]) => Point, reverse = false) {
  const parts = reverse
    ? [...JAR_SEGMENTS].reverse().map((part) => [...part].reverse().map(toScreen))
    : JAR_SEGMENTS.map((part) => part.map(toScreen));
  let d = "";
  for (const part of parts) {
    const [a, b, c, e] = part;
    if (!a || !b) continue;
    d += c && e ? `C${at(b)} ${at(c)} ${at(e)}` : `L${at(b)}`;
  }
  return { start: parts[0]?.[0], d };
}

function screenOf(ctm: DOMMatrix) {
  return (x: number, y: number): Point => ({
    x: ctm.a * x + ctm.c * y + ctm.e,
    y: ctm.b * x + ctm.d * y + ctm.f,
  });
}

/** The curl, where the outline starts, and the direction the outline sets off in from it. */
function curlOf(toScreen: (point: readonly [number, number]) => Point) {
  const curl = toScreen([150, 128]);
  const next = toScreen([172, 152]);
  const length = Math.hypot(next.x - curl.x, next.y - curl.y) || 1;
  return { curl, dx: (next.x - curl.x) / length, dy: (next.y - curl.y) / length };
}

export function JarThread({ progress }: { progress: number }) {
  const line = useRef<SVGPathElement>(null);
  const measure = useRef<SVGPathElement>(null);
  const latest = useRef(progress);
  const redraw = useRef<() => void>(() => {});

  useEffect(() => {
    let frame = 0;
    const root = document.documentElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let travelling: HTMLElement | null = null;
    const setTravelling = (element: HTMLElement | null) => {
      if (travelling && travelling !== element) delete travelling.dataset.thread;
      if (element) element.dataset.thread = "travelling";
      travelling = element;
    };
    const setEnd = (end: HTMLElement | null, state: "drawing" | "drawn" | null) => {
      if (!end) return;
      if (state) end.dataset.thread = state;
      else delete end.dataset.thread;
    };

    const draw = () => {
      frame = 0;
      const path = line.current;
      const ruler = measure.current;
      if (!path || !ruler) return;
      const end = document.querySelector<HTMLElement>("[data-thread-end]");
      const heroCtm = document.querySelector<SVGSVGElement>("[data-jar-scene]")?.getScreenCTM();
      const target = visibleTarget();
      if (reducedMotion.matches || !heroCtm || !target) {
        path.style.display = "none";
        setTravelling(null);
        setEnd(end, null);
        root.style.removeProperty("--thread-width");
        return;
      }

      // One thickness everywhere: the hero jar's stroke.
      const width = 64 * JAR.scale * heroCtm.a;
      root.style.setProperty("--thread-width", `${width.toFixed(2)}px`);

      const viewport = window.innerHeight;
      const rail = target.getBoundingClientRect();
      const railX = rail.left + rail.width / 2;
      const railTop = { x: railX, y: rail.top };
      const railBottom = { x: railX, y: rail.bottom };

      // 1. The hero jar, backwards, and the curve out of its curl onto the top of the line.
      const heroScreen = screenOf(heroCtm);
      const toHero = ([lx, ly]: readonly [number, number]) =>
        heroScreen(JAR.x + (lx - 256) * JAR.scale, JAR.y + (ly - 256) * JAR.scale);
      const hero = outlineSegments(toHero, true);
      if (!hero.start) return;
      const leave = curlOf(toHero);
      const out = { x: leave.curl.x - leave.dx * 160, y: leave.curl.y - leave.dy * 160 };
      const onto = { x: railX, y: rail.top - Math.max(120, (rail.top - leave.curl.y) * 0.5) };
      const toRail = `M${at(hero.start)}${hero.d}C${at(out)} ${at(onto)} ${at(railTop)}`;
      ruler.setAttribute("d", toRail);
      const railStart = ruler.getTotalLength();
      const railEnd = railStart + rail.height;

      // 2. Down the margin and into the closing jar, when there is one.
      let d = `${toRail}L${at(railBottom)}`;
      let pastRail = 0;
      let closingLength = 0;
      let leaving = 0;
      const endSvg = end?.querySelector("svg");
      const endCtm = endSvg?.getScreenCTM();
      if (endSvg && endCtm) {
        const endScreen = screenOf(endCtm);
        const toEnd = ([lx, ly]: readonly [number, number]) => endScreen(lx, ly);
        const arrive = curlOf(toEnd);
        // Turn above the closing card's words when the jar sits beside them (desktop); otherwise
        // just above the jar, which sits under them (phones).
        const title = document.getElementById("turn-title")?.getBoundingClientRect();
        const beside = title ? endSvg.getBoundingClientRect().left > title.right : false;
        const turnY =
          beside && title ? Math.min(arrive.curl.y - 70, title.top - 44) : arrive.curl.y - 70;
        const down = Math.max(rail.bottom, turnY - TURN);
        // The weave: past a section marked data-thread-swing the thread runs down the other margin,
        // crossing in one S-curve in the empty gaps above and below it, then back to the left.
        const swing = document.querySelector("[data-thread-swing]")?.getBoundingClientRect();
        const farX = root.clientWidth - railX;
        let margin = `L${at({ x: railX, y: down })}`;
        const weaves = !!swing && swing.top - BEND > rail.bottom && swing.bottom + BEND < down;
        if (swing && weaves) {
          margin =
            `L${at({ x: railX, y: swing.top - BEND })}` +
            `C${at({ x: railX, y: swing.top })} ${at({ x: farX, y: swing.top })} ${at({ x: farX, y: swing.top + BEND })}` +
            `L${at({ x: farX, y: swing.bottom - BEND })}` +
            `C${at({ x: farX, y: swing.bottom })} ${at({ x: railX, y: swing.bottom })} ${at({ x: railX, y: swing.bottom + BEND })}` +
            `L${at({ x: railX, y: down })}`;
        }
        const toTurn = `${toRail}L${at(railBottom)}${margin}`;
        ruler.setAttribute("d", toTurn);
        const turnStart = ruler.getTotalLength();
        const run = Math.max(railX + TURN, arrive.curl.x - 140);
        const into = { x: arrive.curl.x - arrive.dx * 70, y: arrive.curl.y - arrive.dy * 70 };
        d =
          `${toTurn}Q${at({ x: railX, y: turnY })} ${at({ x: railX + TURN, y: turnY })}` +
          `L${at({ x: run, y: turnY })}C${at({ x: run + 70, y: turnY })} ${at(into)} ${at(arrive.curl)}` +
          outlineSegments(toEnd).d;
        closingLength = JAR_OUTLINE_LENGTH * endCtm.a;
        path.setAttribute("d", d);
        pastRail = Math.max(0, path.getTotalLength() - railEnd);

        // The head. Each piece of the way takes a share of the scroll: a straight run as much as it
        // drops (so the head stays at the pen's height: on desktop where the sticky line's bottom
        // sits, so it only leaves once the line moves on; on phones three quarters down), each
        // crossing more than its small drop so it is not rushed (the straight run after it wins the
        // time back), and the last run into the jar half its length. If the page ends sooner, every
        // share shrinks so the jar is always whole by the end.
        const pen =
          target.dataset.threadTarget === "desktop"
            ? viewport * 0.5 - 144 + rail.height
            : viewport * 0.72;
        const marginLength = turnStart - railEnd;
        const pieces: [length: number, scroll: number][] = [];
        if (swing && weaves) {
          const before = swing.top - BEND - rail.bottom;
          const beside = swing.bottom - swing.top - 2 * BEND;
          const after = down - (swing.bottom + BEND);
          const curve = Math.max(0, (marginLength - before - beside - after) / 2);
          const crossing = Math.max(2 * BEND, curve * CROSSING_PACE);
          const extra = crossing - 2 * BEND;
          pieces.push(
            [before, before],
            [curve, crossing],
            [beside, Math.max(beside * 0.4, beside - extra)],
            [curve, crossing],
            [after, Math.max(after * 0.4, after - extra)],
          );
        } else pieces.push([marginLength, marginLength]);
        const last = pastRail - marginLength;
        pieces.push([last, last * 0.5]);

        const scrolled = Math.max(0, pen - rail.bottom);
        const available = root.scrollHeight - viewport - (window.scrollY - scrolled);
        const planned = pieces.reduce((sum, [, scroll]) => sum + scroll, 0);
        const squeeze = planned > 0 ? Math.min(1, Math.max(1, available) / planned) : 1;
        let left = scrolled;
        for (const [length, scroll] of pieces) {
          const share = scroll * squeeze;
          if (left < share) {
            leaving += share > 0 ? length * (left / share) : length;
            break;
          }
          left -= share;
          leaving += length;
        }
        leaving = Math.min(pastRail, leaving);
      } else {
        path.setAttribute("d", d);
      }
      const total = path.getTotalLength();

      // Which stretch shows.
      const unwind = segment(latest.current, UNWIND_START, 1);
      // 0 while the line is below the fold, 1 once its top reaches 40 % of the screen.
      const travel = clamp01((viewport * 0.92 - rail.top) / (viewport * 0.52));
      // The phone route runs the whole list; arriving and leaving, the stretch covers a screen.
      const shownLine = Math.min(rail.height, viewport);
      const jarLength = JAR_OUTLINE_LENGTH * JAR.scale * heroCtm.a;
      let tail = 0;
      let head = 0;
      if (unwind > 0 && travel < 1) {
        // Out of the hero: while pinned the outline crawls one jar-length out of the curl, keeping
        // its length; as the line arrives the stretch travels on and becomes exactly the line.
        const bridge = Math.max(0, railStart - jarLength);
        const pinned = easeInOut(unwind);
        const arrived = easeInOut(travel);
        const lead = Math.min(bridge, jarLength);
        tail = jarLength * pinned + bridge * arrived;
        head = jarLength + lead * pinned + (bridge + shownLine - lead) * arrived;
      } else if (unwind >= 1 && leaving > 0) {
        // Down the page: the stretch leaves the line and grows back into a whole outline.
        head = railEnd + leaving;
        tail = Math.max(railStart, head - lerp(shownLine, closingLength, leaving / pastRail));
      }

      const drawn = closingLength > 0 && leaving >= pastRail - 0.5;
      setEnd(end, drawn ? "drawn" : "drawing");
      // The line stays away while the stretch is anywhere but on it.
      setTravelling(head - tail > 0.5 || drawn ? target : null);
      if (head - tail <= 0.5 || drawn) {
        path.style.display = "none";
        return;
      }
      path.style.strokeDasharray = `${head - tail} ${total + 20}`;
      path.style.strokeDashoffset = `${-tail}`;
      path.style.strokeWidth = `${width}`;
      path.style.display = "";
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    redraw.current = schedule;
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reducedMotion.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reducedMotion.removeEventListener("change", schedule);
      setTravelling(null);
      root.style.removeProperty("--thread-width");
    };
  }, []);

  useEffect(() => {
    latest.current = progress;
    redraw.current();
  }, [progress]);

  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 z-30 size-full overflow-visible motion-reduce:hidden"
    >
      {/* Measures lengths along the path (up to the line, up to the turn); never painted. */}
      <path ref={measure} fill="none" stroke="none" />
      <path
        ref={line}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ display: "none" }}
        className="stroke-teal-600 dark:stroke-teal-300"
      />
    </svg>
  );
}
