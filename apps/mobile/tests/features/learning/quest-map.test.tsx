import {
  chestReward,
  currentQuestWeek,
  questCopy,
  questMap,
  roadmapCopy,
} from "@jarso/core/learning";
import { BADGES } from "@jarso/core/progress";
import { render, screen, userEvent } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import { jarsoCenterX, QuestMap } from "@/features/learning";

jest.mock("expo-router", () => ({ useRouter: jest.fn() }));

const router = { push: jest.fn() };
const WIDTH = 324;

type Status = "done" | "current" | "locked";
const journey = (statuses: Status[]) =>
  statuses.map((status, i) => ({
    key: `m${i + 1}`,
    day: i + 1,
    title: `Mission ${i + 1}`,
    status,
  }));
const weekOf = (statuses: Status[], width = WIDTH) => {
  const week = currentQuestWeek(questMap(journey(statuses), { width }));
  if (!week) throw new Error("no week");
  return week;
};
const reward = (earned = false) => ({ ...chestReward(1, { badges: [], level: 1 }), earned });

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue(router);
});

const MIDWAY: Status[] = ["done", "done", "current", "locked", "locked", "locked", "locked"];

describe("QuestMap", () => {
  it("draws seven stops and a chest", async () => {
    await render(<QuestMap week={weekOf(MIDWAY)} width={WIDTH} reward={reward()} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getAllByLabelText(/, locked$/)).toHaveLength(4);
    expect(screen.getByLabelText(questCopy.chestLocked)).toBeOnTheScreen();
  });

  it("the now stop opens its mission", async () => {
    await render(<QuestMap week={weekOf(MIDWAY)} width={WIDTH} reward={reward()} />);
    await userEvent.press(screen.getByRole("button", { name: questCopy.playStop(3, "Mission 3") }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/(child)/learn/[missionKey]",
      params: { missionKey: "m3" },
    });
    expect(screen.getByTestId("quest-stop-now")).toBeOnTheScreen();
    expect(screen.getByText(questCopy.today(3))).toBeOnTheScreen();
  });

  it("a locked stop is not a button", async () => {
    await render(<QuestMap week={weekOf(MIDWAY)} width={WIDTH} reward={reward()} />);
    const name = roadmapCopy.locked(roadmapCopy.stopName(4, "Mission 4"));
    expect(screen.getByLabelText(name)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name })).toBeNull();
  });

  it("all done shows the open chest with its badge name and Jarso's line", async () => {
    const week = weekOf(Array<Status>(7).fill("done"));
    await render(<QuestMap week={week} width={WIDTH} reward={reward(true)} />);
    expect(screen.getByLabelText(questCopy.chestOpen)).toBeOnTheScreen();
    expect(screen.getByText(BADGES[reward().badge].name)).toBeOnTheScreen();
    expect(screen.getByText(questCopy.allDone)).toBeOnTheScreen();
  });

  it("a shut chest stays shut even when its badge is already earned", async () => {
    await render(<QuestMap week={weekOf(MIDWAY)} width={WIDTH} reward={reward(true)} />);
    expect(screen.getByLabelText(questCopy.chestLocked)).toBeOnTheScreen();
    expect(screen.queryByText(BADGES[reward().badge].name)).toBeNull();
  });

  it("the chest never shows money", async () => {
    await render(
      <QuestMap week={weekOf(Array<Status>(7).fill("done"))} width={WIDTH} reward={reward(true)} />,
    );
    expect(screen.queryByText(/[£₹$€]|\d+\.\d{2}/)).toBeNull();
  });

  it("Jarso stands on the other side when the stop is in a far-right lane", async () => {
    // Day 4 sits in the 0.8 lane: his usual right-hand spot would run off the map.
    const week = weekOf(["done", "done", "done", "current", "locked", "locked", "locked"]);
    const stop = week.stops[3];
    if (!stop) throw new Error("no stop");
    await render(<QuestMap week={week} width={WIDTH} reward={reward()} />);
    const style = screen.getByTestId("quest-jarso").props.style;
    const { left, width } = Object.assign({}, ...[style].flat());
    expect(left + width).toBeLessThanOrEqual(stop.x - 32);
  });
});

describe("jarsoCenterX", () => {
  it("prefers the right of the stop", () => {
    expect(jarsoCenterX(100, WIDTH)).toBe(180);
  });

  it("flips to the left when the right would overflow, at any width", () => {
    for (const width of [280, 324, 360]) {
      const x = Math.min(0.8 * width, width - 32);
      const centre = jarsoCenterX(x, width);
      expect(centre + 48).toBeLessThanOrEqual(x - 32);
      expect(centre - 48).toBeGreaterThanOrEqual(0);
    }
  });
});
