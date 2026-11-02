"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * Milliseconds since `play` turned true, up to `duration`, one update per frame. Back to 0 when
 * `play` turns false, so the next entry replays. With reduced motion it is always the end, in view
 * or not: every demo shows its final state and never its starting one.
 */
export function useTimeline(play: boolean, duration: number): number {
  const reduced = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (reduced) return;
    if (!play) {
      setElapsed(0);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const next = Math.min(duration, now - start);
      setElapsed(next);
      if (next < duration) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [play, reduced, duration]);

  return reduced ? duration : elapsed;
}
