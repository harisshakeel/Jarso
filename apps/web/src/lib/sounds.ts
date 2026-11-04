// Jarso's few sounds (design.md §8, "Sound"): coins clinking when money moves, a chime for a
// right answer, a soft bonk for a wrong one, a short fanfare when a mission is done.
// Synthesised with the Web Audio API, so there are no audio files; short and quiet; off with
// one switch (kept in localStorage); never before the person has touched the page, which is
// also what browsers require. Isomorphic: on the server and in a browser without Web Audio
// every call is a no-op. Demo 3 (2026-11-04): each note is two layers (a body and a bright
// partial) with a rounded attack and a slow decay, so the tones sound like bells and wood
// rather than a beeper.

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

/**
 * Whether the person has touched the page yet. The browser's own record
 * (`navigator.userActivation`) answers on any page; the listener from `primeSounds` covers
 * browsers without it. Before 2026-11-04 only the listener counted, and only the Settings page
 * started it, so a lesson opened straight from Learn never chimed.
 */
function touched(): boolean {
  if (gestureSeen) return true;
  const activation = (window.navigator as { userActivation?: { hasBeenActive?: boolean } })
    .userActivation;
  return activation?.hasBeenActive === true;
}

/** The audio context, made on first use and only after a gesture; null when sound can't play. */
function audio(): AudioContext | null {
  if (!hasWindow() || !touched() || !soundsOn()) return null;
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
  /** A second, brighter layer an octave (or `partial` times) up, quieter; gives a bell its ring. */
  partial?: number;
  /** Seconds the attack takes; longer is softer (default 10 ms). */
  attack?: number;
};

function voice(
  ctx: AudioContext,
  freq: number,
  slideTo: number | undefined,
  start: number,
  end: number,
  type: OscillatorType,
  gain: number,
  attack: number,
): void {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, end);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(Math.min(gain, 0.2), start + attack);
  // A bell's decay: most of the way down early, then a tail to the end.
  amp.gain.exponentialRampToValueAtTime(Math.min(gain, 0.2) * 0.3, start + (end - start) * 0.45);
  amp.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(start);
  osc.stop(end + 0.02);
}

function play(tones: Tone[]): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const tone of tones) {
    const start = now + tone.at;
    const end = start + tone.dur;
    const attack = tone.attack ?? 0.01;
    voice(ctx, tone.freq, tone.slideTo, start, end, tone.type, tone.gain, attack);
    if (tone.partial) {
      // The partial is sine and about a third as loud; it fades faster than the body.
      const slide = tone.slideTo ? tone.slideTo * tone.partial : undefined;
      voice(
        ctx,
        tone.freq * tone.partial,
        slide,
        start,
        start + tone.dur * 0.6,
        "sine",
        tone.gain * 0.35,
        attack,
      );
    }
  }
}

/**
 * Coins clinking: three short bright taps, each a little different, with a glassy partial so
 * they ring like metal, about a third of a second.
 */
export function playCoins(): void {
  play([
    { freq: 2600, at: 0, dur: 0.1, type: "triangle", gain: 0.12, partial: 2.76 },
    { freq: 3100, at: 0.08, dur: 0.1, type: "triangle", gain: 0.1, partial: 2.76 },
    { freq: 2850, at: 0.17, dur: 0.14, type: "triangle", gain: 0.09, partial: 2.76 },
  ]);
}

/** A right answer: a bright bell on two rising notes (a fifth), like "yes, that's it". */
export function playRight(): void {
  play([
    { freq: 659, at: 0, dur: 0.16, type: "triangle", gain: 0.12, partial: 2, attack: 0.008 },
    { freq: 988, at: 0.13, dur: 0.34, type: "triangle", gain: 0.13, partial: 2, attack: 0.008 },
  ]);
}

/** A wrong answer: one soft, woody "hm", a slow attack and a gentle slide down, never a buzzer. */
export function playWrong(): void {
  play([{ freq: 240, slideTo: 170, at: 0, dur: 0.3, type: "sine", gain: 0.1, attack: 0.03 }]);
}

/**
 * A mission done: a short three-note fanfare up a major chord and a held top note, under a
 * second. Played once when the finish screen shows.
 */
export function playFanfare(): void {
  play([
    { freq: 523, at: 0, dur: 0.14, type: "triangle", gain: 0.11, partial: 2 },
    { freq: 659, at: 0.12, dur: 0.14, type: "triangle", gain: 0.11, partial: 2 },
    { freq: 784, at: 0.24, dur: 0.14, type: "triangle", gain: 0.12, partial: 2 },
    { freq: 1047, at: 0.36, dur: 0.5, type: "triangle", gain: 0.14, partial: 2, attack: 0.012 },
  ]);
}

/** For tests: forgets the context and the gesture. */
export function resetSoundsForTests(): void {
  context = null;
  gestureSeen = false;
  primed = false;
}
