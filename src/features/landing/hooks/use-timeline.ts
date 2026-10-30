"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * Milliseconds since `play` turned true, up to `duration`, one update per frame. Back to 0 when
 * `play` turns false, so the next entry replays. With reduced motion it jumps straight to the end:
 * every demo then shows its final state.
 */
export function useTimeline(play: boolean, duration: number): number {
  const reduced = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!play) {
      setElapsed(0);
      return;
    }
    if (reduced) {
      setElapsed(duration);
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

  return elapsed;
}
