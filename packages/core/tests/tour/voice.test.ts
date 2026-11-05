import { coachIds, textHash } from "@jarso/core/learning";
import {
  spokenTourLine,
  tourContent,
  tourLineId,
  tourSteps,
  tourVoice,
  tourVoiceClips,
  tourVoicePath,
} from "@jarso/core/tour";
import { describe, expect, it } from "vitest";

const lineIds = tourSteps.flatMap((step) =>
  step.kind === "tap" ? [tourLineId(step, false), tourLineId(step, true)] : [tourLineId(step, false)],
);

describe("tour content", () => {
  it("has words for every bubble, and nothing the tour never shows", () => {
    expect(Object.keys(tourContent.lines).sort()).toEqual([...lineIds].sort());
    for (const lineId of Object.keys(tourContent.voices)) expect(lineIds).toContain(lineId);
  });
});

describe("tourVoice", () => {
  it("lets Nell ask for a buddy and Jarso say hi; the buddy says everything else", () => {
    expect(tourVoice("pick", null)).toBe("nell");
    expect(tourVoice("pick", "bo")).toBe("nell");
    expect(tourVoice("jarso-arrive", "zuzu")).toBe("jarso");
    expect(tourVoice("streak", "pip")).toBe("pip");
    expect(tourVoice("streak", null)).toBeNull();
  });

  it("agrees with the steps on who speaks when a tab opens", () => {
    for (const step of tourSteps) {
      if (step.kind !== "tap") continue;
      const voice = tourVoice(tourLineId(step, true), "pip");
      expect(voice === "jarso").toBe(step.arrive.speaker === "jarso");
    }
  });
});

describe("spokenTourLine", () => {
  it("leaves the child's name out, so one recording fits every child", () => {
    expect(spokenTourLine("pick", "nell")).toBe("Hi! Pick a buddy to show you around.");
    expect(spokenTourLine("hello", "zuzu")).toBe("Hey, I'm Zuzu! Let's check out your money world.");
    expect(spokenTourLine("jarso-arrive", "jarso")).toBe(
      "Hi! I'm Jarso. Ask me anything about money, any time.",
    );
    expect(spokenTourLine("finish", "bo")).toBe(
      "You're all set! Watch this again any time from Me.",
    );
  });

  it("keeps a line without names word for word", () => {
    expect(spokenTourLine("streak", "pip")).toBe(
      "This flame is your run. Learn a little every day and watch it grow!",
    );
  });
});

describe("tourVoicePath", () => {
  it("names the voice, the line and a hash of the spoken words", () => {
    expect(tourVoicePath("hello", "pip")).toBe(
      `/tour/voice/pip-hello-${textHash("Hey, I'm Pip! Let's check out your money world.")}.mp3`,
    );
  });
});

describe("tourVoiceClips", () => {
  it("records each buddy line once per kid and each fixed line once", () => {
    const clips = tourVoiceClips();
    const fixed = Object.keys(tourContent.voices).length;
    const buddyLines = Object.keys(tourContent.lines).length - fixed;
    expect(clips).toHaveLength(buddyLines * coachIds.length + fixed);
    expect(new Set(clips.map((clip) => clip.path)).size).toBe(clips.length);
    for (const clip of clips) expect(clip.words).not.toMatch(/[{}]/);
  });
});
