// Small easing helpers for the landing page's scripted motion. Times and progress are plain
// numbers, so every frame is a pure function of where the scroll or the clock is.

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Progress through [start, end]: 0 before it, 1 after it. */
export const segment = (value: number, start: number, end: number) =>
  clamp01((value - start) / (end - start));

export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

export const easeOut = (t: number) => 1 - (1 - t) ** 3;

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** Overshoots a little, then settles: badges and stars popping in. */
export const easeOutBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

/** Falls with gravity, then one small bounce over the last 15 %. Returns 0 to 1 plus the bounce. */
export const drop = (t: number) =>
  t < 0.85 ? (t / 0.85) ** 2 : 1 - Math.sin(((t - 0.85) / 0.15) * Math.PI) * 0.04;

/** How much of `text` is typed `elapsed` ms after `start`, at `perChar` ms a character. */
export const typed = (text: string, elapsed: number, start: number, perChar = 28) =>
  text.slice(0, Math.max(0, Math.floor((elapsed - start) / perChar)));
