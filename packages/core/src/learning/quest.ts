import { availableWear, type Wear } from "../mascot";
import type { BadgeKey } from "../progress";
import type { JourneyMission } from "./types";

export const QUEST_STOPS_PER_WEEK = 7;

export type QuestStopState = "done" | "now" | "locked";
export type QuestPoint = { x: number; y: number };
export type QuestStop = QuestPoint & {
  key: string;
  day: number;
  title: string;
  state: QuestStopState;
};
/** A chest gives a badge and a look, never money. */
export type ChestReward = { badge: BadgeKey; earned: boolean; wear: Wear };
export type QuestWeek = {
  week: number;
  stops: QuestStop[];
  chest: QuestPoint & { open: boolean };
  jarso: QuestPoint & { on: "stop" | "chest"; day: number | null };
  done: number;
  total: number;
  /** SVG path through every stop then the chest. */
  pathD: string;
  height: number;
};

const LANES = [0.5, 0.22, 0.62, 0.8, 0.45, 0.2, 0.55] as const;
const CHEST_BADGES: readonly BadgeKey[] = ["missions_5", "missions_10"];
const STATE: Record<JourneyMission["status"], QuestStopState> = {
  done: "done",
  current: "now",
  locked: "locked",
};

type QuestMission = Pick<JourneyMission, "key" | "day" | "title" | "status">;

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

export function questMap(
  journey: readonly QuestMission[],
  layout: { width?: number; stopSize?: number; rowGap?: number } = {},
): QuestWeek[] {
  const { width = 324, stopSize = 64, rowGap = 96 } = layout;
  const half = stopSize / 2;
  const clamp = (x: number) => round(Math.min(Math.max(x, half), width - half));
  const weeks: QuestWeek[] = [];

  for (let start = 0; start < journey.length; start += QUEST_STOPS_PER_WEEK) {
    const slice = journey.slice(start, start + QUEST_STOPS_PER_WEEK);
    const stops: QuestStop[] = slice.map((m, i) => ({
      key: m.key,
      day: m.day,
      title: m.title,
      state: STATE[m.status],
      x: clamp((LANES[i] ?? 0.5) * width),
      y: half + i * rowGap,
    }));
    const done = stops.filter((s) => s.state === "done").length;
    const chest = {
      x: round(width / 2),
      y: half + stops.length * rowGap,
      open: done === stops.length,
    };
    const now = stops.find((s) => s.state === "now");
    const jarso = now
      ? { x: clamp(now.x + stopSize * 0.9), y: now.y, on: "stop" as const, day: now.day }
      : { x: clamp(chest.x + stopSize * 0.9), y: chest.y, on: "chest" as const, day: null };

    const points: QuestPoint[] = [...stops, chest];
    let pathD = `M ${stops[0]?.x ?? chest.x} ${stops[0]?.y ?? chest.y}`;
    points.forEach((b, i) => {
      const a = points[i - 1];
      if (!a) return;
      const mid = round((a.y + b.y) / 2);
      pathD += ` C ${a.x} ${mid} ${b.x} ${mid} ${b.x} ${b.y}`;
    });

    weeks.push({
      week: start / QUEST_STOPS_PER_WEEK + 1,
      stops,
      chest,
      jarso,
      done,
      total: stops.length,
      pathD,
      height: chest.y + half,
    });
  }
  return weeks;
}

/** The week holding the "now" stop, else the last. */
export function currentQuestWeek(weeks: readonly QuestWeek[]): QuestWeek | null {
  return (
    weeks.find((w) => w.stops.some((s) => s.state === "now")) ?? weeks[weeks.length - 1] ?? null
  );
}

export function chestReward(
  week: number,
  input: { badges: readonly BadgeKey[]; level: number },
): ChestReward {
  const badge = CHEST_BADGES[week - 1] ?? (CHEST_BADGES[CHEST_BADGES.length - 1] as BadgeKey);
  const wears = availableWear(input.level);
  return {
    badge,
    earned: input.badges.includes(badge),
    wear: wears[wears.length - 1] as Wear,
  };
}
