// Jarso's few sounds (design.md §8, "Sound"): coins clinking when money moves, a chime for a
// right answer, a soft bonk for a wrong one. Synthesised with the Web Audio API, so there are
// no audio files; short and quiet; off with one switch (kept in localStorage); never before the
// person has touched the page, which is also what browsers require. Isomorphic: on the server
// and in a browser without Web Audio every call is a no-op.

export const SOUNDS_KEY = "jarso:sounds";

type Listener = () => void;
const listeners = new Set<Listener>();
let context: AudioContext | null = null;
/** True once the person has pressed a key or pointer on the page: browsers allow sound then. */
let gestureSeen = false;
let primed = false;

const hasWindow = () => typeof window !== "undefined";

/** Whether sounds are on: the stored choice, else on. Storage can be blocked, so it may throw. */
export function soundsOn(): boolean {
  if (!hasWindow()) return true;
  try {
    return window.localStorage.getItem(SOUNDS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundsOn(on: boolean): void {
  if (!hasWindow()) return;
  try {
    if (on) window.localStorage.removeItem(SOUNDS_KEY);
    else window.localStorage.setItem(SOUNDS_KEY, "off");
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore: change notifications for the on/off choice. */
export function subscribeSounds(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Starts listening for the first key or pointer press. Safe to call many times. */
export function primeSounds(): void {
  if (!hasWindow() || primed) return;
  primed = true;
  const seen = () => {
    gestureSeen = true;
  };
  window.addEventListener("pointerdown", seen, { capture: true, passive: true });
  window.addEventListener("keydown", seen, { capture: true, passive: true });
}

/** The audio context, made on first use and only after a gesture; null when sound can't play. */
function audio(): AudioContext | null {
  if (!hasWindow() || !gestureSeen || !soundsOn()) return null;
  const Ctor = window.AudioContext;
  if (typeof Ctor !== "function") return null;
  context ??= new Ctor();
  if (context.state === "suspended") context.resume().catch(() => undefined);
  return context;
}

type Tone = {
  /** Hz at the start, and where it slides to by the end (defaults to the start). */
  freq: number;
  slideTo?: number;
  /** Seconds after now. */
  at: number;
  /** Seconds. */
  dur: number;
  type: OscillatorType;
  /** Peak gain, at most 0.2 (design.md: quiet). */
  gain: number;
};

function play(tones: Tone[]): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const tone of tones) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const start = now + tone.at;
    const end = start + tone.dur;
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.freq, start);
    if (tone.slideTo) osc.frequency.exponentialRampToValueAtTime(tone.slideTo, end);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(Math.min(tone.gain, 0.2), start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

/** Coins clinking: three short bright taps, each a little different, about a third of a second. */
export function playCoins(): void {
  play([
    { freq: 2600, at: 0, dur: 0.09, type: "triangle", gain: 0.12 },
    { freq: 3100, at: 0.08, dur: 0.09, type: "triangle", gain: 0.1 },
    { freq: 2850, at: 0.17, dur: 0.11, type: "triangle", gain: 0.09 },
  ]);
}

/** A right answer: two notes rising, like "yes, that's it". */
export function playRight(): void {
  play([
    { freq: 660, at: 0, dur: 0.12, type: "triangle", gain: 0.12 },
    { freq: 880, at: 0.12, dur: 0.2, type: "triangle", gain: 0.12 },
  ]);
}

/** A wrong answer: one soft low bonk, kind, never a buzzer. */
export function playWrong(): void {
  play([{ freq: 220, slideTo: 160, at: 0, dur: 0.25, type: "sine", gain: 0.1 }]);
}

/** For tests: forgets the context and the gesture. */
export function resetSoundsForTests(): void {
  context = null;
  gestureSeen = false;
  primed = false;
}
