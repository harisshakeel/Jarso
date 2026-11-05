// The tour's recorded voices (2026-11-06): every buddy line in that buddy's own voice, made once
// by scripts/lesson-voice.py into the web app's public/tour/voice. A recording leaves the child's
// name out, so one file fits every child, and its file name carries a hash of the words, so an
// edited line is simply missing and the device's voice says it instead.
import { type CoachId, coachIds, coachNames, textHash } from "@jarso/core/learning";
import { type TourVoice, tourContent, tourTemplate } from "./content";
import type { TourStep } from "./steps";

/** The line a bubble shows: the step's own, or "<step>-arrive" once its tab has opened. */
export function tourLineId(step: TourStep, arrived: boolean): string {
  return step.kind === "tap" && arrived ? `${step.id}-arrive` : step.id;
}

/**
 * Whose recording says a line: its fixed voice (Nell asks the child to pick a buddy), otherwise
 * the child's buddy. Null for a line the device reads (Jarso saying hi on its own tab), and
 * before a buddy is picked.
 */
export function tourVoice(lineId: string, buddy: CoachId | null): TourVoice | null {
  if (tourContent.deviceVoice.includes(lineId)) return null;
  return tourContent.voices[lineId] ?? buddy;
}

/** The words a recording says: the line without the child's name, with the speaker's own name. */
export function spokenTourLine(lineId: string, voice: TourVoice): string {
  return tourTemplate(lineId)
    .replace(/,? \{name\}/g, "")
    .replaceAll("{buddy}", voice === "jarso" ? "Jarso" : coachNames[voice]);
}

/** Where a line's recording is served: /tour/voice/<voice>-<line>-<hash>.mp3 */
export function tourVoicePath(lineId: string, voice: TourVoice): string {
  return `/tour/voice/${voice}-${lineId}-${textHash(spokenTourLine(lineId, voice))}.mp3`;
}

export type TourVoiceClip = { lineId: string; voice: TourVoice; words: string; path: string };

/** Every recording the tour can play: each buddy line once per kid, a fixed line once. */
export function tourVoiceClips(): TourVoiceClip[] {
  return Object.keys(tourContent.lines).flatMap((lineId) => {
    if (tourContent.deviceVoice.includes(lineId)) return [];
    const fixed = tourContent.voices[lineId];
    const voices: readonly TourVoice[] = fixed ? [fixed] : coachIds;
    return voices.map((voice) => ({
      lineId,
      voice,
      words: spokenTourLine(lineId, voice),
      path: tourVoicePath(lineId, voice),
    }));
  });
}
