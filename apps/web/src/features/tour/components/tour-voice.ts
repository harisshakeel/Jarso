// The tour's voice: each bubble read once, by the speaker's own recording (made once by
// scripts/lesson-voice.py; see tourVoicePath in @jarso/core/tour) or, when there is none, by the
// same calm device voice the lessons use, at the same pace. Off with the mute button
// (remembered in localStorage). Browsers only play sound after the child has tapped the page, so
// the very first bubble may stay silent; every tap after that (picking a buddy, Next) unlocks
// it. Isomorphic no-op where there is no audio or speech.
import { pickVoice, READ_ALOUD_RATE, type SpeechVoice } from "@/features/learning";

const MUTE_KEY = "jarso:tour-voice";

type Utterance = {
  lang: string;
  rate: number;
  pitch: number;
  voice: SpeechVoice | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type Speech = {
  speak(utterance: Utterance): void;
  cancel(): void;
  getVoices?(): SpeechVoice[];
};

function speech(): { synth: Speech; Utterance: new (text: string) => Utterance } | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    speechSynthesis?: Speech;
    SpeechSynthesisUtterance?: new (text: string) => Utterance;
  };
  if (!w.speechSynthesis || typeof w.SpeechSynthesisUtterance !== "function") return null;
  return { synth: w.speechSynthesis, Utterance: w.SpeechSynthesisUtterance };
}

/** Whether the voice is muted (stored choice; storage can be blocked). */
export function tourMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "off";
  } catch {
    return false;
  }
}

export function setTourMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "off" : "on");
  } catch {
    // Private window or blocked storage: the choice lasts until the page closes.
  }
  if (muted) hush();
}

let player: HTMLAudioElement | null = null;
/** Recordings that failed to load on this visit: their lines go straight to the device voice. */
const missing = new Set<string>();
/** Bumped by every new line and by hush(), so a late failure never speaks an old line. */
let turn = 0;

/**
 * Says one line, stopping whatever was being said: the recording at `clip` when there is one,
 * else the device voice, where `pitch` lifts Jarso's voice a little.
 */
export function sayLine(line: string, pitch = 1, clip: string | null = null): void {
  hush();
  if (!clip || missing.has(clip) || typeof Audio === "undefined") {
    speak(line, pitch);
    return;
  }
  const mine = turn;
  let settled = false;
  const fallBack = (fileMissing: boolean) => {
    if (fileMissing) missing.add(clip);
    if (settled || mine !== turn) return;
    settled = true;
    speak(line, pitch);
  };
  player ??= new Audio();
  player.onerror = () => fallBack(true);
  player.src = clip;
  try {
    const started = player.play() as Promise<void> | undefined;
    // Refused (no tap yet) or unsupported: the device voice tries instead.
    if (started) started.catch(() => fallBack(false));
    else fallBack(false);
  } catch {
    fallBack(false);
  }
}

function speak(line: string, pitch: number): void {
  const api = speech();
  if (!api) return;
  const utterance = new api.Utterance(line);
  utterance.lang = "en-GB";
  utterance.rate = READ_ALOUD_RATE;
  utterance.pitch = pitch;
  utterance.voice = pickVoice(api.synth.getVoices?.() ?? [], "en");
  api.synth.speak(utterance);
}

export function hush(): void {
  turn++;
  player?.pause();
  speech()?.synth.cancel();
}
