"use client";

import { SquareIcon, Volume2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

/** The little of the Web Speech API this button uses (no types package needed). */
export type SpeechVoice = {
  name: string;
  lang: string;
  /** False for a voice that sends the words to a server to speak them. */
  localService: boolean;
};
type Utterance = {
  lang: string;
  rate: number;
  pitch: number;
  voice: SpeechVoice | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type UtteranceClass = new (text: string) => Utterance;
type Synth = {
  speaking: boolean;
  speak(utterance: Utterance): void;
  cancel(): void;
  getVoices?(): SpeechVoice[];
};

/** The browser's speech synthesis, or null where it has none (or on the server). */
function synth(): { synth: Synth; Utterance: UtteranceClass } | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    speechSynthesis?: Synth;
    SpeechSynthesisUtterance?: UtteranceClass;
  };
  if (!w.speechSynthesis || typeof w.SpeechSynthesisUtterance !== "function") return null;
  return { synth: w.speechSynthesis, Utterance: w.SpeechSynthesisUtterance };
}

/**
 * How fast the words come. The browser's default (1) is about 180 words a minute, which
 * children reading along found too fast in the 2026-11-04 pilot; 0.85 is about 150.
 */
export const READ_ALOUD_RATE = 0.85;

/**
 * Calm, clear voices that come with the device, best first: the UK and other English voices
 * on Apple devices, then Windows and Android ones. Matched as a word in the voice's name.
 */
const LIKED = [
  "serena",
  "martha",
  "kate",
  "stephanie",
  "daniel",
  "arthur",
  "samantha",
  "karen",
  "moira",
  "tessa",
  "fiona",
  "hazel",
  "susan",
  "george",
  "zira",
];

/** Apple's novelty and old robotic voices: never picked, even when nothing better is there. */
const NOVELTY =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley)\b/i;

/**
 * The voice to read a lesson in, or null to leave it to the browser. Only voices on the device
 * count (the words never leave it), only English ones, never a novelty voice. The page's own
 * accent comes first, then a higher-quality ("Premium", "Enhanced", "Natural") voice, then the
 * liked list.
 */
export function pickVoice(voices: readonly SpeechVoice[], lang: string): SpeechVoice | null {
  const wanted = lang.toLowerCase().replace("_", "-");
  let best: SpeechVoice | null = null;
  let bestScore = -1;
  for (const voice of voices) {
    const voiceLang = voice.lang.toLowerCase().replace("_", "-");
    if (!voice.localService || !voiceLang.startsWith("en") || NOVELTY.test(voice.name)) continue;
    const name = voice.name.toLowerCase();
    const liked = LIKED.findIndex((n) => new RegExp(`\\b${n}\\b`).test(name));
    const score =
      (voiceLang === wanted ? 100 : 0) +
      (/premium|enhanced|natural|neural/.test(name) ? 50 : 0) +
      (liked === -1 ? 0 : LIKED.length - liked);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

/**
 * "Read aloud" (demo 3): the browser reads a lesson's words with a voice on the device, so
 * nothing leaves it. The words stay on screen throughout (captions always on). One thing
 * speaks at a time: pressing the button again, moving to the next step or leaving the page
 * stops it. Shown only where the browser can speak, decided after mount so the server's HTML
 * matches.
 */
export function ReadAloudButton({
  text,
  label = "Read aloud",
  className,
}: {
  /** The plain words to read, in order; money already written out. */
  text: string;
  label?: string;
  className?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const mine = useRef<Utterance | null>(null);

  useEffect(() => {
    const api = synth();
    setSupported(api !== null);
    // Some browsers load their voices on the first ask: ask now, so they are ready on a press.
    api?.synth.getVoices?.();
  }, []);

  // New words (the next step) and leaving the page both stop the old reading.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the text changing is the trigger
  useEffect(() => {
    setSpeaking(false);
    return () => {
      const api = synth();
      if (api && mine.current) api.synth.cancel();
      mine.current = null;
    };
  }, [text]);

  function stop() {
    const api = synth();
    if (api && mine.current) api.synth.cancel();
    mine.current = null;
    setSpeaking(false);
  }

  function start() {
    const api = synth();
    if (!api) return;
    api.synth.cancel();
    const utterance = new api.Utterance(text);
    const lang = document.documentElement.lang || "en-GB";
    const voice = pickVoice(api.synth.getVoices?.() ?? [], lang);
    utterance.lang = voice?.lang ?? lang;
    if (voice) utterance.voice = voice;
    // Slower than the default: these are children reading along.
    utterance.rate = READ_ALOUD_RATE;
    utterance.pitch = 1;
    utterance.onend = () => {
      if (mine.current === utterance) stop();
    };
    utterance.onerror = utterance.onend;
    mine.current = utterance;
    setSpeaking(true);
    api.synth.speak(utterance);
  }

  if (!supported) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={speaking}
      onClick={speaking ? stop : start}
      className={className}
    >
      {speaking ? <SquareIcon aria-hidden /> : <Volume2Icon aria-hidden />}
      {speaking ? "Stop" : label}
    </Button>
  );
}
