// The lesson film's voice: one spoken line at a time, and how far through it is (0 to 1), so the
// scene moves with the words. Three ways to speak, best first:
// 1. The line's recording (a soft female AI voice, made once by scripts/lesson-voice.py).
// 2. The browser's own voice, a soft female one on the device, when the recording is missing.
// 3. Silence on a timer, when the browser can't speak at all (the captions still show).
// Browsers only play sound after a tap, so `primeFilmVoice()` runs inside the Start mission tap
// and unlocks one shared audio element for the rest of the film.

import { filmVoicePath } from "@jarso/core/learning";
import { pickVoice, READ_ALOUD_RATE, type SpeechVoice } from "../read-aloud-button";

/** 52 bytes of silence: playing it inside a tap unlocks the shared element on Safari. */
const SILENCE =
  "data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA==";

/** Soft female voices that come with the device, best first; male ones are never picked. */
const SOFT_FEMALE = [
  "serena",
  "martha",
  "kate",
  "stephanie",
  "samantha",
  "karen",
  "moira",
  "tessa",
  "fiona",
  "hazel",
  "susan",
  "zira",
  "libby",
  "sonia",
];

let shared: HTMLAudioElement | null = null;

/** Starts playback; resolves false when the browser refuses or can't play (some return nothing). */
function tryPlay(audio: HTMLAudioElement): Promise<boolean> {
  try {
    const started = audio.play() as Promise<void> | undefined;
    return started ? started.then(() => true).catch(() => false) : Promise.resolve(false);
  } catch {
    return Promise.resolve(false);
  }
}

type Speech = {
  speak(utterance: unknown): void;
  cancel(): void;
  getVoices?(): SpeechVoice[];
};
type UtteranceLike = {
  lang: string;
  rate: number;
  pitch: number;
  voice: SpeechVoice | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function speech(): { synth: Speech; Utterance: new (text: string) => UtteranceLike } | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    speechSynthesis?: Speech;
    SpeechSynthesisUtterance?: new (text: string) => UtteranceLike;
  };
  if (!w.speechSynthesis || typeof w.SpeechSynthesisUtterance !== "function") return null;
  return { synth: w.speechSynthesis, Utterance: w.SpeechSynthesisUtterance };
}

/** Call inside the tap that starts the film. Safe to call more than once. */
export function primeFilmVoice(): void {
  if (typeof window === "undefined" || typeof Audio === "undefined") return;
  shared ??= new Audio();
  shared.src = SILENCE;
  void tryPlay(shared);
  // Safari unlocks speech the same way: something spoken inside a tap.
  const api = speech();
  if (api) {
    const hush = new api.Utterance("");
    api.synth.speak(hush);
  }
}

/** A soft female browser voice for the fallback, or null to let the browser choose. */
export function pickSoftVoice(voices: readonly SpeechVoice[], lang: string): SpeechVoice | null {
  const female = voices.filter((voice) =>
    SOFT_FEMALE.some((name) => new RegExp(`\\b${name}\\b`, "i").test(voice.name)),
  );
  return pickVoice(female, lang);
}

/** About how long the browser takes to say a line, for the timer and the scene's progress. */
export function estimateMs(line: string): number {
  const words = line.trim().split(/\s+/).length;
  // ~150 words a minute at the default rate, slowed to the lesson rate.
  return Math.max(2500, Math.round((words / (150 * READ_ALOUD_RATE)) * 60_000) + 600);
}

export type LineHandle = {
  /** 0 to 1 through the line, read every frame. */
  progress(): number;
  /** True while sound is coming out (the narrator's mouth moves). */
  speaking(): boolean;
  stop(): void;
};

/**
 * Speaks one line and calls `onEnd` once it has finished. Tries the recording, then the browser's
 * voice, then a silent timer. `recordingMissing` remembers a 404 so later lines skip the wait.
 */
export function speakLine(
  missionKey: string,
  index: number,
  line: string,
  onEnd: () => void,
  memo: { recordingMissing: boolean },
): LineHandle {
  let stopped = false;
  let finished = false;
  let fallback: LineHandle | null = null;
  const end = () => {
    if (finished || stopped) return;
    finished = true;
    onEnd();
  };

  if (typeof Audio !== "undefined") shared ??= new Audio();
  const audio = shared;
  if (audio && !memo.recordingMissing) {
    const onError = () => {
      cleanup();
      memo.recordingMissing = true;
      if (!stopped && !fallback) fallback = speakFallback(line, end);
    };
    const onEnded = () => {
      cleanup();
      end();
    };
    const cleanup = () => {
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", onEnded);
    };
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", onEnded);
    audio.src = filmVoicePath(missionKey, index, line);
    void tryPlay(audio).then((playing) => {
      // Refused (no tap yet), missing or unsupported: the browser voice or the timer takes over.
      if (playing || stopped || fallback || finished) return;
      cleanup();
      fallback = speakFallback(line, end);
    });
    return {
      progress: () => {
        if (fallback) return fallback.progress();
        if (finished) return 1;
        const { currentTime, duration } = audio;
        return Number.isFinite(duration) && duration > 0 ? Math.min(1, currentTime / duration) : 0;
      },
      speaking: () => (fallback ? fallback.speaking() : !audio.paused && !finished),
      stop: () => {
        stopped = true;
        cleanup();
        audio.pause();
        fallback?.stop();
      },
    };
  }
  fallback = speakFallback(line, end);
  return {
    progress: () => fallback?.progress() ?? 1,
    speaking: () => fallback?.speaking() ?? false,
    stop: () => {
      stopped = true;
      fallback?.stop();
    },
  };
}

/** The browser's voice (soft, female, slower) with a timer as the clock, or the timer alone. */
function speakFallback(line: string, onEnd: () => void): LineHandle {
  const started = performance.now();
  const expected = estimateMs(line);
  let done = false;
  let stopped = false;
  const finish = () => {
    if (done || stopped) return;
    done = true;
    onEnd();
  };
  const api = speech();
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (api) {
    api.synth.cancel();
    const utterance = new api.Utterance(line);
    const lang = document.documentElement.lang || "en-GB";
    const voice = pickSoftVoice(api.synth.getVoices?.() ?? [], lang);
    utterance.lang = voice?.lang ?? lang;
    if (voice) utterance.voice = voice;
    utterance.rate = READ_ALOUD_RATE;
    utterance.pitch = 1.05;
    utterance.onend = finish;
    utterance.onerror = finish;
    api.synth.speak(utterance);
    // Some browsers never fire onend: move on a little after the expected length regardless.
    timer = setTimeout(finish, expected * 1.6 + 1500);
  } else {
    timer = setTimeout(finish, expected);
  }
  return {
    progress: () => (done ? 1 : Math.min(0.97, (performance.now() - started) / expected)),
    speaking: () => !done && !stopped && performance.now() - started < expected,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      api?.synth.cancel();
    },
  };
}
