"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * Whether the element is in view. `rootMargin` shrinks the viewport, so "-45% 0px -45% 0px" means
 * "crossing the middle of the screen". Each entry counts again, so demos replay on the way back.
 */
export function useInView(
  ref: RefObject<HTMLElement | null>,
  { threshold = 0.4, rootMargin = "0px" }: { threshold?: number; rootMargin?: string } = {},
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setInView(entry.isIntersecting);
      },
      { threshold, rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold, rootMargin]);

  return inView;
}
