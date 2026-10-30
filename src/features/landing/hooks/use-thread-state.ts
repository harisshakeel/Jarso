"use client";

import { type RefObject, useEffect, useState } from "react";

/** What the page thread (`jar-thread.tsx`) is doing to an element, from its `data-thread`. */
export type ThreadState = "none" | "drawing" | "drawn";

/**
 * Follows the `data-thread` attribute the thread sets on the closing jar: "drawing" while the
 * thread is on its way and drawing the outline, "drawn" once the outline is whole. "none" when no
 * thread runs (reduced motion), so the element can animate on its own.
 */
export function useThreadState(ref: RefObject<HTMLElement | null>): ThreadState {
  const [state, setState] = useState<ThreadState>("none");

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const read = () => {
      const value = element.dataset.thread;
      setState(value === "drawing" || value === "drawn" ? value : "none");
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(element, { attributes: true, attributeFilter: ["data-thread"] });
    return () => observer.disconnect();
  }, [ref]);

  return state;
}
