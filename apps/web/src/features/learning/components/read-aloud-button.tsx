"use client";

import { SquareIcon, Volume2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

/** The little of the Web Speech API this button uses (no types package needed). */
type Utterance = {
  lang: string;
  rate: number;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type UtteranceClass = new (text: string) => Utterance;
type Synth = {
  speaking: boolean;
  speak(utterance: Utterance): void;
  cancel(): void;
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
 * "Read aloud" (demo 3): the browser reads a lesson's words with its own voice, offline and
 * on the device, so nothing leaves it. The words stay on screen throughout (captions always
 * on). One thing speaks at a time: pressing the button again, moving to the next step or
 * leaving the page stops it. Shown only where the browser can speak, decided after mount so
 * the server's HTML matches.
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
    setSupported(synth() !== null);
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
    utterance.lang = document.documentElement.lang || "en-GB";
    // A touch slower than the default: these are children reading along.
    utterance.rate = 0.95;
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
