"use client";

import { playerCopy } from "@jarso/core/learning";
import { PauseIcon, PlayIcon, RotateCcwIcon, SkipForwardIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KidMood } from "@/components/brand";
import { Button } from "@/components/ui";
import { cn } from "@/lib";
import { FILM_VIEWBOX, type FilmScene } from "./film-scenes";
import { type LineHandle, speakLine } from "./film-voice";

type Status = "playing" | "paused" | "done";

/** A breath between lines, so the voice never runs one line into the next. */
const GAP_MS = 350;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  );
}

/**
 * The lesson film (design.md §6): a 10 to 15 second animated intro before a mission's first
 * step. Nell tells the story in a soft voice, line by line, with each line as a caption in her
 * speech bubble, while the scene moves through that line's beat. Pause, watch again or skip at
 * any time; at the end "Let's start" opens the mission. Reduced motion shows each beat's last
 * frame, still, while the line is spoken.
 */
export function LessonFilm({
  missionKey,
  title,
  lines,
  scene,
  onDone,
}: {
  missionKey: string;
  /** The mission's title, for the film's name. */
  title: string;
  lines: readonly string[];
  scene: FilmScene;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<Status>("playing");
  const [line, setLine] = useState(0);
  const [p, setP] = useState(0);
  const [talking, setTalking] = useState(false);
  const handle = useRef<LineHandle | null>(null);
  const memo = useRef({ recordingMissing: false });
  const startButton = useRef<HTMLButtonElement>(null);
  const gap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const still = useRef(false);

  const stopVoice = useCallback(() => {
    if (gap.current) clearTimeout(gap.current);
    gap.current = null;
    handle.current?.stop();
    handle.current = null;
  }, []);

  // Speak the current line while playing; move to the next when it ends.
  useEffect(() => {
    if (status !== "playing") return;
    still.current = prefersReducedMotion();
    const text = lines[line];
    const beat = scene.beats[line];
    if (text === undefined || !beat) return;
    let frame = 0;
    const current = speakLine(
      missionKey,
      line,
      text,
      () => {
        setP(beat[1]);
        setTalking(false);
        if (line + 1 < lines.length) {
          gap.current = setTimeout(() => setLine(line + 1), GAP_MS);
        } else {
          setStatus("done");
        }
      },
      memo.current,
    );
    handle.current = current;
    const tick = () => {
      const progress = still.current ? 1 : current.progress();
      setP(beat[0] + (beat[1] - beat[0]) * progress);
      setTalking(current.speaking());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      current.stop();
      if (handle.current === current) handle.current = null;
    };
  }, [status, line, lines, missionKey, scene]);

  useEffect(() => stopVoice, [stopVoice]);

  useEffect(() => {
    if (status === "done") startButton.current?.focus();
  }, [status]);

  function pause() {
    stopVoice();
    setTalking(false);
    setStatus("paused");
  }

  function play() {
    // Resuming starts the current line again from its beat's beginning, in step with the voice.
    setP(scene.beats[line]?.[0] ?? 0);
    setStatus("playing");
  }

  function replay() {
    stopVoice();
    setLine(0);
    setP(0);
    setStatus("playing");
  }

  function finish() {
    stopVoice();
    onDone();
  }

  // The mouth opens and closes about six times a second while sound is coming out.
  const mood: KidMood =
    status === "done"
      ? "cheer"
      : talking && Math.floor(performance.now() / 160) % 2 === 0
        ? "talk"
        : "smile";
  const caption = lines[Math.min(line, lines.length - 1)] ?? "";

  return (
    <section
      aria-label={playerCopy.film.label(title)}
      className="rise-in mx-auto grid w-full max-w-3xl gap-4 rounded-2xl bg-card p-4 shadow-raised sm:p-6"
    >
      <p className="eyebrow">{playerCopy.film.eyebrow}</p>
      <div className="overflow-hidden rounded-xl bg-tint-teal">
        <svg viewBox={FILM_VIEWBOX} role="img" aria-label={scene.label} className="block w-full">
          <scene.Scene p={p} mood={mood} />
        </svg>
      </div>

      {/* Nell's speech bubble: the caption, always on, the same words as the voice. */}
      <div
        className={cn(
          "relative rounded-2xl rounded-tl-sm bg-secondary px-4 py-3",
          "before:absolute before:-top-2 before:left-6 before:size-4 before:rotate-45 before:bg-secondary",
        )}
      >
        <p className="font-semibold text-ink-2 text-sm">{playerCopy.film.narrator}</p>
        <p aria-live="polite" className="text-balance font-semibold text-lg">
          {caption}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {status === "done" ? (
          <>
            <Button
              ref={startButton}
              variant="keycap"
              size="xl"
              className="w-full sm:w-fit"
              onClick={finish}
            >
              {playerCopy.film.start}
            </Button>
            <Button variant="outline" size="lg" onClick={replay}>
              <RotateCcwIcon aria-hidden />
              {playerCopy.film.replay}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="lg" onClick={status === "paused" ? play : pause}>
              {status === "paused" ? <PlayIcon aria-hidden /> : <PauseIcon aria-hidden />}
              {status === "paused" ? playerCopy.film.play : playerCopy.film.pause}
            </Button>
            <Button variant="ghost" size="lg" onClick={finish}>
              <SkipForwardIcon aria-hidden />
              {playerCopy.film.skip}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
