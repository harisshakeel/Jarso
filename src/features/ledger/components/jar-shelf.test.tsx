import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type GoalView, goalProgress } from "@/features/goals";
import type { Availability, SavingsRequest } from "@/features/requests";
import { JarShelf } from "./jar-shelf";

vi.mock("@/features/diary", () => ({
  PurchaseSheet: () => <button type="button">Spent something?</button>,
}));
vi.mock("@/features/requests", () => ({
  TakeOutSheet: () => <button type="button">Take out</button>,
  PutInSheet: () => <button type="button">Put in</button>,
}));
vi.mock("@/features/goals", async () => {
  const progress = await import("@/features/goals/progress");
  return {
    ...progress,
    GoalSheet: ({ goal }: { goal: unknown }) => (
      <button type="button">{goal ? "Change my goal" : "Set a goal"}</button>
    ),
  };
});

afterEach(cleanup);

const availability: Availability = {
  spendMinor: 800,
  saveMinor: 3100,
  reservedSaveMinor: 500,
  heldSpendMinor: 0,
  availableSaveMinor: 2600,
  availableSpendMinor: 800,
  takeOutLimitMinor: null,
};

function goal(countedMinor: number, planMinor: number | null = 400): GoalView {
  return {
    goal: {
      id: "g1",
      name: "Football boots",
      emoji: "⚽",
      targetMinor: 4500,
      planMinor,
      reachedAt: null,
      celebratedAt: null,
    },
    progress: goalProgress({
      saveMinor: countedMinor,
      reservedMinor: 0,
      targetMinor: 4500,
      planMinor,
    }),
  };
}

function request(partial: Partial<SavingsRequest>): SavingsRequest {
  return {
    id: "r1",
    kind: "withdrawal",
    status: "pending",
    amountMinor: 500,
    reason: null,
    auto: false,
    occurredAt: "2026-10-31T10:00:00Z",
    ...partial,
  };
}

function shelf(props: Partial<Parameters<typeof JarShelf>[0]> = {}) {
  render(
    <JarShelf
      currency="GBP"
      userId="c1"
      availability={availability}
      rules={[]}
      goal={goal(2600)}
      allowanceMinor={500}
      dueMinor={0}
      openRequests={[]}
      {...props}
    />,
  );
}

describe("JarShelf", () => {
  it("writes both balances and what each jar is", () => {
    shelf();
    expect(screen.getByText("£8")).toBeInTheDocument();
    expect(screen.getByText("Cash you have")).toBeInTheDocument();
    expect(screen.getByText("£31")).toBeInTheDocument();
    expect(screen.getByText("Kept by your parent")).toBeInTheDocument();
  });

  it("says what is left of the goal and about how long", () => {
    shelf();
    expect(screen.getByText("⚽ Football boots, £45.")).toBeInTheDocument();
    expect(screen.getByText("£19 to go · about 5 more allowances at £4 each")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change my goal" })).toBeInTheDocument();
  });

  it("asks for a plan when there is none", () => {
    shelf({ goal: goal(2600, null) });
    expect(screen.getByText("£19 to go")).toBeInTheDocument();
    expect(
      screen.getByText("Set how much you'll save each time to see how long it'll take"),
    ).toBeInTheDocument();
  });

  it("says the goal is reached", () => {
    shelf({ goal: goal(4500) });
    expect(screen.getByText("Goal reached")).toBeInTheDocument();
  });

  it("offers a goal when there is none", () => {
    shelf({ goal: null });
    expect(screen.getByRole("button", { name: "Set a goal" })).toBeInTheDocument();
  });

  it("shows money that is due outside the jars", () => {
    shelf({ dueMinor: 500 });
    expect(screen.getByText("£5 on its way · waiting for a parent")).toBeInTheDocument();
  });

  it("puts open requests under the jar they affect", () => {
    shelf({
      openRequests: [
        request({}),
        request({ id: "r2", status: "approved", amountMinor: 200 }),
        request({ id: "r3", kind: "deposit", amountMinor: 300 }),
      ],
    });
    expect(screen.getByText("£5 asked from Save · waiting for your parent")).toBeInTheDocument();
    expect(screen.getByText("£2 from Save · your parent said yes")).toBeInTheDocument();
    expect(screen.getByText("£3 to Save · give it to your parent")).toBeInTheDocument();
  });

  it("explains the jar drawing in words", () => {
    shelf({ dueMinor: 500 });
    expect(screen.getByText("Counts toward your goal")).toBeInTheDocument();
    expect(screen.getByText("Waiting to come out")).toBeInTheDocument();
    expect(screen.getByText("On its way")).toBeInTheDocument();
  });

  it("writes how much counts toward the goal when some is waiting to come out", () => {
    shelf();
    expect(screen.getByText("£26 counts toward it")).toBeInTheDocument();
  });

  it("draws due money between the jars, not on the Save jar", () => {
    const { container } = render(
      <JarShelf
        currency="GBP"
        userId="c1"
        availability={availability}
        rules={[]}
        goal={null}
        allowanceMinor={500}
        dueMinor={500}
        openRequests={[]}
      />,
    );
    expect(container.querySelector("[data-due-coin]")).toBeNull();
    expect(screen.getByText("£5 on its way · waiting for a parent")).toBeInTheDocument();
  });
});
