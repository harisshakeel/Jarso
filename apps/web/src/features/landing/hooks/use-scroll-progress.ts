"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * "pinned": through a tall section whose child is sticky, 0 when its top reaches the viewport top
 * and 1 when its bottom reaches the viewport bottom. "crossing": as the element moves from 85 % to
 * 25 % of the viewport height.
 */
type Mode = "pinned" | "crossing";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Scroll progress of an element, 0 to 1, read once per frame. With `ease` below 1 the value moves
 * that fraction of the way toward the scroll position each frame, so scrubbed motion stays smooth
 * when the wheel jumps.
 */
export function useScrollProgress(
  ref: RefObject<HTMLElement | null>,
  mode: Mode,
  ease = 1,
): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    let current = -1;

    const target = () => {
      const rect = element.getBoundingClientRect();
      const viewport = window.innerHeight;
      const raw =
        mode === "pinned"
          ? -rect.top / Math.max(1, rect.height - viewport)
          : (viewport * 0.85 - rect.top) / (viewport * 0.6);
      return clamp01(raw);
    };

    const step = () => {
      frame = 0;
      const goal = target();
      const next = current < 0 || ease >= 1 ? goal : current + (goal - current) * ease;
      current = Math.abs(goal - next) < 0.0005 ? goal : next;
      setProgress(current);
      if (current !== goal) frame = requestAnimationFrame(step);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(step);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ref, mode, ease]);

  return progress;
}
