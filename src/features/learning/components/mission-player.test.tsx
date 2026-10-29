import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Step, StepResult } from "../types";
import { MissionPlayer } from "./mission-player";

vi.mock("../server/actions", () => ({
  completeCheckInAction: vi.fn(),
  completeMissionAction: vi.fn(),
  recordPracticeAction: vi.fn(),
  recordStepAction: vi.fn(),
  startMissionAction: vi.fn(),
}));

const actions = await import("../server/actions");

const hints: [string, string] = ["Look at the price.", "Compare it with {m:900}."];
const choice = (key: string, answer = "a"): Step => ({
  type: "choice",
  key,
  skill: "balance.afford",
  prompt: `Question ${key}?`,
  options: [
    { id: "a", text: "Option A", feedback: "A it is." },
    { id: "b", text: "Option B", feedback: "Not quite. B is too much." },
  ],
  answer,
  hints,
  correct: "Nice. That's it.",
  replay: {
    type: "choice",
    skill: "balance.afford",
    prompt: `Replay ${key}?`,
    options: [
      { id: "a", text: "Again A", feedback: "Yes." },
      { id: "b", text: "Again B", feedback: "Not quite." },
    ],
    answer,
    hints,
    correct: "Right.",
  },
});

const steps: Step[] = [
  { type: "info", key: "intro", title: "The idea", body: "Read this first." },
  choice("one"),
  choice("two"),
];

const ok = <T,>(data: T) => ({ ok: true as const, data });

function renderMission(attemptId: string | null, results: StepResult[] = []) {
  render(
    <MissionPlayer
      mode={{ kind: "mission", missionKey: "m1", attemptId, results }}
      steps={steps}
      currency="GBP"
      intro={{ eyebrow: "Day 1", heading: "Mission one", body: "About three minutes." }}
      doneHref={"/child/learn" as never}
      doneLabel="Back to Learn"
    />,
  );
}

async function answer(option: string) {
  fireEvent.click(screen.getByLabelText(option));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
  });
}

async function continueOn() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  });
}

beforeEach(() => {
  vi.mocked(actions.recordStepAction).mockResolvedValue(ok({ correct: true }));
  vi.mocked(actions.completeMissionAction).mockResolvedValue(
    ok({ answerable: 2, firstTry: 1, hints: 1 }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MissionPlayer", () => {
  it("starts, replays a step missed first time once, then finishes", async () => {
    vi.mocked(actions.startMissionAction).mockResolvedValue(
      ok({ attemptId: "att-1", results: [] }),
    );
    renderMission(null);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start mission" }));
    });
    expect(screen.getByRole("heading", { name: "The idea" })).toBeInTheDocument();
    await continueOn();

    // Step one: right first time.
    await answer("Option A");
    expect(screen.getByText("That's it.")).toBeInTheDocument();
    await continueOn();

    // Step two: wrong, a hint, then right.
    await answer("Option B");
    expect(screen.getByText("Have another go.")).toBeInTheDocument();
    expect(screen.getByText("Not quite. B is too much.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: "Hint" }));
    expect(screen.getByRole("list", { name: "Hints" })).toHaveTextContent("Look at the price.");
    await answer("Option A");
    await continueOn();

    // Only step two comes back, as its replay variant, and only once.
    expect(screen.getByText("One more look: 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Replay two?" })).toBeInTheDocument();
    await answer("Again A");
    await continueOn();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Mission done. Nice work." })).toBeInTheDocument(),
    );
    expect(screen.getByText("1 of 2 first try. 1 hint.")).toBeInTheDocument();
    expect(actions.recordStepAction).toHaveBeenCalledTimes(3);
    expect(vi.mocked(actions.recordStepAction).mock.calls[1]?.[1]).toMatchObject({
      stepKey: "two",
      phase: "main",
      tries: 2,
      hintsUsed: 1,
    });
    expect(actions.completeMissionAction).toHaveBeenCalledWith(null, { attemptId: "att-1" });
  });

  it("shows the answer after two wrong tries", async () => {
    vi.mocked(actions.startMissionAction).mockResolvedValue(
      ok({ attemptId: "att-1", results: [] }),
    );
    renderMission(null);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start mission" }));
    });
    await continueOn();
    await answer("Option B");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await answer("Option B");
    expect(screen.getByText("Here's how it works.")).toBeInTheDocument();
    expect(screen.getByText("The answer: Option A.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("resumes in the replay phase", async () => {
    renderMission("att-1", [
      { stepKey: "one", phase: "main", correct: true, hintsUsed: 0, tries: 1 },
      { stepKey: "two", phase: "main", correct: false, hintsUsed: 0, tries: 2 },
    ]);
    expect(
      screen.getByRole("heading", { name: "Pick up where you left off." }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("heading", { name: "Replay two?" })).toBeInTheDocument();
  });

  it("finishes straight away when every step was already answered", async () => {
    renderMission("att-1", [
      { stepKey: "one", phase: "main", correct: true, hintsUsed: 0, tries: 1 },
      { stepKey: "two", phase: "main", correct: true, hintsUsed: 0, tries: 1 },
    ]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });
    await waitFor(() =>
      expect(actions.completeMissionAction).toHaveBeenCalledWith(null, { attemptId: "att-1" }),
    );
    expect(screen.getByRole("heading", { name: "Mission done. Nice work." })).toBeInTheDocument();
  });

  it("keeps the step and offers a retry when saving fails, including a dropped connection", async () => {
    vi.mocked(actions.startMissionAction).mockResolvedValue(
      ok({ attemptId: "att-1", results: [] }),
    );
    vi.mocked(actions.recordStepAction).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderMission(null);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start mission" }));
    });
    await continueOn();
    await answer("Option A");
    await continueOn();
    expect(screen.getByRole("alert")).toHaveTextContent("Check your connection and try again.");
    expect(screen.getByRole("heading", { name: "Question one?" })).toBeInTheDocument();

    await continueOn();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Question two?" })).toBeInTheDocument();
  });

  it("shows no right or wrong in the check-in and reports what the child knew", async () => {
    vi.mocked(actions.completeCheckInAction).mockResolvedValue(ok({ correctCount: 1 }));
    render(
      <MissionPlayer
        mode={{ kind: "check-in" }}
        steps={[choice("q1"), choice("q2")]}
        currency="GBP"
        intro={{ eyebrow: "Before mission 1", heading: "Five quick questions.", body: "No score." }}
        doneHref={"/child/learn" as never}
        doneLabel="Go to your missions"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start the questions" }));
    fireEvent.click(screen.getByLabelText("Option B"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });
    expect(screen.queryByText("Have another go.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Option A"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Thanks. That helps pick where you start." }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("You already knew 1 of 5. Mission 1 is a quick warm-up."),
    ).toBeInTheDocument();
    expect(vi.mocked(actions.completeCheckInAction).mock.calls[0]?.[1]).toEqual({
      answers: [
        { stepKey: "q1", answer: { kind: "option", optionId: "b" } },
        { stepKey: "q2", answer: { kind: "option", optionId: "a" } },
      ],
    });
  });
});
