"use client";

import { guideCopy } from "@jarso/core/guide";
import { MicIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib";

/** The little of the Web Speech API this button uses (no types package needed). */
type Alternative = { transcript: string };
type Result = ArrayLike<Alternative> & { isFinal: boolean };
type ResultEvent = { resultIndex: number; results: ArrayLike<Result> };
export type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: ResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionClass = new () => Recognition;

/** The browser's recognition class, under either of its names, or null. */
function recognitionClass(): RecognitionClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceState = "idle" | "listening" | "failed";

/**
 * A microphone beside Ask: the browser listens (its own speech recognition, nothing sent to
 * Jarso) and the words land in the question box; the person still presses Ask, so every
 * question goes through the screened pipeline on an explicit send. Shown only where the browser
 * has the API, decided after mount so the server's HTML matches.
 */
export function VoiceButton({
  onStart,
  onInterim,
  onFinal,
  onState,
  disabled,
}: {
  /** Listening starts: the caller notes what was typed so far. */
  onStart: () => void;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onState: (state: VoiceState) => void;
  disabled?: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const current = useRef<Recognition | null>(null);

  useEffect(() => {
    setSupported(recognitionClass() !== null);
    return () => current.current?.abort();
  }, []);

  function stop() {
    current.current?.stop();
  }

  function start() {
    const Recognition = recognitionClass();
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = document.documentElement.lang || "en-GB";
    recognition.interimResults = true;
    recognition.continuous = false;
    let failed = false;
    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) final += text;
        else interim += text;
      }
      if (final) onFinal(final.trim());
      else if (interim) onInterim(interim);
    };
    recognition.onerror = () => {
      failed = true;
    };
    recognition.onend = () => {
      current.current = null;
      setListening(false);
      onState(failed ? "failed" : "idle");
    };
    current.current = recognition;
    onStart();
    setListening(true);
    onState("listening");
    try {
      recognition.start();
    } catch {
      current.current = null;
      setListening(false);
      onState("failed");
    }
  }

  if (!supported) return null;
  return (
    <Button
      type="button"
      variant={listening ? "secondary" : "outline"}
      size="icon"
      aria-label={guideCopy.voice.label}
      aria-pressed={listening}
      disabled={disabled}
      onClick={listening ? stop : start}
      className={cn(listening && "motion-safe:pulse-soft")}
    >
      {listening ? <SquareIcon aria-hidden /> : <MicIcon aria-hidden />}
    </Button>
  );
}
