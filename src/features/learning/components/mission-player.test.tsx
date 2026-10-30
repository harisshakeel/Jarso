import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboxItem, SubmitResult } from "@/features/offline";
import type { Step, StepResult } from "../types";
import { MissionPlayer } from "./mission-player";

const { submitToOutbox, useOutbox, useOnline } = vi.hoisted(() => ({
  submitToOutbox: vi.fn(),
  useOutbox: vi.fn(),
  useOnline: vi.fn(),
}));

vi.mock("../server/actions", () => ({ startMissionAction: vi.fn() }));
vi.mock("@/features/offline", async () => ({
  offlineCopy: (await import("@/features/offline/copy")).offlineCopy,
  newId: (await import("@/features/offline/outbox/uuid")).uuid,
  runOnline: (await import("@/features/offline/online-action")).runOnline,
  showsAsPending: (await import("@/features/offline/outbox/state")).showsAsPending,
  submitToOutbox,
  useOutbox,
  useOnline,
}));

const actions = await import("../server/actions");

const USER_ID = "child-1";
const ATTEMPT_ID = "6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";

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
      userId={USER_ID}
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

type Submitted = { userId: string; kind: string; payload: Record<string, unknown> };

/** Every outbox submit so far, in order. */
function submitted(): Submitted[] {
  return submitToOutbox.mock.calls.map((call) => call[0] as Submitted);
}

/** What the server answers for each kind when the item is sent straight away. */
function sendAll(input: { kind: string }): SubmitResult {
  if (input.kind === "completeMission")
    return { status: "sent", data: { answerable: 2, firstTry: 1, hints: 1 } };
  if (input.kind === "checkIn") return { status: "sent", data: { correctCount: 1 } };
  return { status: "sent", data: { correct: true } };
}

async function startMission() {
  vi.mocked(actions.startMissionAction).mockResolvedValue(
    ok({ attemptId: ATTEMPT_ID, results: [] }),
  );
  renderMission(null);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Start mission" }));
  });
}

function waitingItem(status: OutboxItem["status"], attempts = 1): OutboxItem {
  const now = new Date().toISOString();
  return {
    id: "item-1",
    userId: USER_ID,
    kind: "step",
    payload: {},
    idempotencyKey: "item-1",
    occurredAt: now,
    createdAt: now,
    attempts,
    nextAttemptAt: now,
    status,
  };
}

beforeEach(() => {
  submitToOutbox.mockImplementation(async (input: { kind: string }) => sendAll(input));
  useOutbox.mockReturnValue([]);
  useOnline.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("MissionPlayer", () => {
  it("starts, replays a step missed first time once, then finishes", async () => {
    await startMission();
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
    // Steps go into the outbox before the completion, so the server gets them in order.
    expect(submitted().map((s) => s.kind)).toEqual(["step", "step", "step", "completeMission"]);
    expect(submitted().every((s) => s.userId === USER_ID)).toBe(true);
    expect(submitted()[1]?.payload).toEqual({
      attemptId: ATTEMPT_ID,
      stepKey: "two",
      phase: "main",
      answer: { kind: "option", optionId: "a" },
      tries: 2,
      hintsUsed: 1,
    });
    expect(submitted()[3]?.payload).toEqual({ attemptId: ATTEMPT_ID });
  });

  it("a queued step result advances to the next step", async () => {
    submitToOutbox.mockResolvedValue({ status: "queued" });
    await startMission();
    await continueOn();
    await answer("Option A");
    await continueOn();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Question two?" })).toBeInTheDocument();
  });

  it("builds the finish screen on the device when the completion is queued", async () => {
    submitToOutbox.mockResolvedValue({ status: "queued" });
    await startMission();
    await continueOn();
    await answer("Option A");
    await continueOn();
    fireEvent.click(screen.getByRole("button", { name: "Hint" }));
    await answer("Option A");
    await continueOn();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Mission done. Nice work." })).toBeInTheDocument(),
    );
    expect(screen.getByText("2 of 2 first try. 1 hint.")).toBeInTheDocument();
    expect(submitted().map((s) => s.kind)).toEqual(["step", "step", "completeMission"]);
  });

  it("shows Saved on this device while items wait", async () => {
    useOutbox.mockReturnValue([waitingItem("waiting")]);
    await startMission();
    expect(useOutbox).toHaveBeenCalledWith(USER_ID);
    expect(screen.getByText("Saved on this device.")).toBeInTheDocument();
    cleanup();

    // An item that needs a look isn't waiting to send, so the note goes.
    useOutbox.mockReturnValue([waitingItem("needs_look")]);
    await startMission();
    expect(screen.queryByText("Saved on this device.")).not.toBeInTheDocument();
  });

  it("shows no saved-on-device note while an online save is in flight", async () => {
    // Every result is stored as waiting just before its first send: that alone isn't news.
    useOutbox.mockReturnValue([waitingItem("waiting", 0), waitingItem("sending", 0)]);
    await startMission();
    expect(screen.queryByText("Saved on this device.")).not.toBeInTheDocument();
    cleanup();

    useOnline.mockReturnValue(false);
    await startMission();
    expect(screen.getByText("Saved on this device.")).toBeInTheDocument();
  });

  it("starting offline shows the offline copy and does not call startMissionAction", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderMission(null);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start mission" }));
    });
    expect(screen.getByText("You're offline, try again when connected")).toBeInTheDocument();
    expect(actions.startMissionAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start mission" })).toBeInTheDocument();
  });

  it("shows the answer after two wrong tries", async () => {
    await startMission();
    await continueOn();
    await answer("Option B");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await answer("Option B");
    expect(screen.getByText("Here's how it works.")).toBeInTheDocument();
    expect(screen.getByText("The answer: Option A.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("resumes in the replay phase", async () => {
    renderMission(ATTEMPT_ID, [
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
    renderMission(ATTEMPT_ID, [
      { stepKey: "one", phase: "main", correct: true, hintsUsed: 0, tries: 1 },
      { stepKey: "two", phase: "main", correct: true, hintsUsed: 0, tries: 1 },
    ]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });
    await waitFor(() => expect(submitted().map((s) => s.kind)).toEqual(["completeMission"]));
    expect(submitted()[0]?.payload).toEqual({ attemptId: ATTEMPT_ID });
    expect(screen.getByRole("heading", { name: "Mission done. Nice work." })).toBeInTheDocument();
  });

  it("keeps the step and offers a retry when the device can't save it", async () => {
    submitToOutbox.mockResolvedValueOnce({ status: "unsaved" });
    await startMission();
    await continueOn();
    await answer("Option A");
    await continueOn();
    expect(screen.getByText("You're offline, try again when connected")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Question one?" })).toBeInTheDocument();

    await continueOn();
    expect(screen.queryByText("You're offline, try again when connected")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Question two?" })).toBeInTheDocument();
  });

  it("keeps the step and shows the server's message when a result is refused", async () => {
    submitToOutbox.mockResolvedValueOnce({
      status: "refused",
      message: "We couldn't find that mission.",
    });
    await startMission();
    await continueOn();
    await answer("Option A");
    await continueOn();
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't find that mission.");
    expect(screen.getByRole("heading", { name: "Question one?" })).toBeInTheDocument();
  });

  it("shows no right or wrong in the check-in and reports what the child knew", async () => {
    render(
      <MissionPlayer
        mode={{ kind: "check-in" }}
        steps={[choice("q1"), choice("q2")]}
        currency="GBP"
        userId={USER_ID}
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
    expect(submitted().map((s) => s.kind)).toEqual(["checkIn"]);
    expect(submitted()[0]?.payload).toEqual({
      answers: [
        { stepKey: "q1", answer: { kind: "option", optionId: "b" } },
        { stepKey: "q2", answer: { kind: "option", optionId: "a" } },
      ],
    });
  });

  it("counts what the child knew on the device when the check-in is queued", async () => {
    submitToOutbox.mockResolvedValue({ status: "queued" });
    render(
      <MissionPlayer
        mode={{ kind: "check-in" }}
        steps={[choice("q1"), choice("q2")]}
        currency="GBP"
        userId={USER_ID}
        intro={{ eyebrow: "Before mission 1", heading: "Five quick questions.", body: "No score." }}
        doneHref={"/child/learn" as never}
        doneLabel="Go to your missions"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start the questions" }));
    for (const option of ["Option A", "Option A"]) {
      fireEvent.click(screen.getByLabelText(option));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Next" }));
      });
    }
    await waitFor(() =>
      expect(
        screen.getByText("You already knew 2 of 5. Mission 1 is a quick warm-up."),
      ).toBeInTheDocument(),
    );
  });

  it("saves a practice answer through the outbox", async () => {
    submitToOutbox.mockResolvedValue({ status: "queued" });
    render(
      <MissionPlayer
        mode={{ kind: "practice" }}
        steps={[choice("p1")]}
        currency="GBP"
        userId={USER_ID}
        doneHref={"/child/learn" as never}
        doneLabel="Back to Learn"
      />,
    );
    await answer("Option A");
    await continueOn();
    expect(
      screen.getByRole("heading", { name: "Practice done. Nicely kept fresh." }),
    ).toBeInTheDocument();
    expect(submitted()).toEqual([
      {
        userId: USER_ID,
        kind: "practice",
        payload: {
          itemKey: "p1",
          answer: { kind: "option", optionId: "a" },
          hintsUsed: 0,
          tries: 1,
        },
        idempotencyKey: expect.any(String),
      },
    ]);
  });
});
