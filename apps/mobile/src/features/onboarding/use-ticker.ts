import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";

const TICKS = 8;
const TICK_MS = 50;

/** A number that counts to its new value in 8 ticks over 400 ms; jumps under reduced motion. */
export function useTicker(value: number): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (reduced || start === value) {
      setShown(value);
      return;
    }
    let tick = 0;
    const id = setInterval(() => {
      tick += 1;
      setShown(Math.round(start + ((value - start) * tick) / TICKS));
      if (tick >= TICKS) clearInterval(id);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [value, reduced]);

  return shown;
}
