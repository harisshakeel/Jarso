import { missions } from "@jarso/core/learning/content";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filmScenes } from "@/features/learning/components/lesson-film/film-scenes";
import { LessonFilm } from "@/features/learning/components/lesson-film/lesson-film";

/** The voice, mocked: each spoken line waits until the test ends it. */
const voice = vi.hoisted(() => ({
  spoken: [] as string[],
  endLine: null as null | (() => void),
  stops: 0,
}));
vi.mock("@/features/learning/components/lesson-film/film-voice", () => ({
  speakLine: (_key: string, _index: number, line: string, onEnd: () => void) => {
    voice.spoken.push(line);
    voice.endLine = onEnd;
    return {
      progress: () => 0.5,
      speaking: () => true,
      stop: () => {
        voice.stops += 1;
      },
    };
  },
  primeFilmVoice: () => undefined,
}));

const lines = [
  "Before you buy something, take a peek inside your Spend jar.",
  "This toy costs five coins, and you have eight. So you can pay!",
  "Eight take away five leaves three. Those three are what's left.",
];

function show(onDone = vi.fn()) {
  const scene = filmScenes["whats-in-spend"];
  if (!scene) throw new Error("no scene");
  render(
    <LessonFilm
      missionKey="whats-in-spend"
      title="What's in Spend?"
      lines={lines}
      scene={scene}
      onDone={onDone}
    />,
  );
  return onDone;
}

/** Ends the line being spoken and lets the short gap before the next one pass. */
async function endLine() {
  await act(async () => {
    voice.endLine?.();
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
}

afterEach(() => {
  cleanup();
  voice.spoken = [];
  voice.endLine = null;
  voice.stops = 0;
});

describe("LessonFilm", () => {
  it("speaks each line in turn with Nell's caption, then offers Let's start", async () => {
    const onDone = show();
    expect(screen.getByRole("region", { name: "Intro: What's in Spend?" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Nell beside a Spend jar/ })).toBeInTheDocument();
    expect(screen.getByText(lines[0] as string)).toBeInTheDocument();
    expect(voice.spoken).toEqual([lines[0]]);
    await endLine();
    expect(screen.getByText(lines[1] as string)).toBeInTheDocument();
    await endLine();
    expect(voice.spoken).toEqual(lines);
    await endLine();
    const start = screen.getByRole("button", { name: "Let's start" });
    expect(start).toHaveFocus();
    fireEvent.click(start);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("skips straight to the mission and stops the voice", () => {
    const onDone = show();
    fireEvent.click(screen.getByRole("button", { name: "Skip intro" }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(voice.stops).toBeGreaterThan(0);
  });

  it("pauses, and plays the line again from its start", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(voice.stops).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(voice.spoken).toEqual([lines[0], lines[0]]);
  });
});

describe("film scenes", () => {
  it("has a scene for every filmed mission, one beat per line, beats covering 0 to 1", () => {
    for (const mission of missions) {
      if (!mission.film) continue;
      const scene = filmScenes[mission.key];
      expect(scene, mission.key).toBeDefined();
      if (!scene) continue;
      expect(scene.beats).toHaveLength(mission.film.lines.length);
      expect(scene.beats[0]?.[0]).toBe(0);
      expect(scene.beats.at(-1)?.[1]).toBe(1);
      scene.beats.slice(1).forEach(([from], i) => {
        expect(from).toBe(scene.beats[i]?.[1]);
      });
    }
  });

  it("draws every frame without throwing", () => {
    for (const scene of Object.values(filmScenes)) {
      if (!scene) continue;
      for (const p of [0, 0.1, 0.3, 0.5, 0.65, 0.8, 1]) {
        const { unmount } = render(
          <svg aria-label="frame">
            <scene.Scene p={p} mood="talk" />
          </svg>,
        );
        unmount();
      }
    }
  });
});
