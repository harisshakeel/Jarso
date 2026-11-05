import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type GoalView, goalProgress } from "@/features/goals";
import { JarShelf } from "@/features/ledger/components/jar-shelf";
import type { Availability, SavingsRequest } from "@/features/requests";

vi.mock("@/features/diary", () => ({
  PurchaseSheet: () => <button type="button">Spent something?</button>,
}));
vi.mock("@/features/requests", async () => ({
  ...(await import("@jarso/core/requests")),
  TakeOutSheet: () => <button type="button">Take out</button>,
  PutInSheet: () => <button type="button">Put in</button>,
}));
vi.mock("@/features/goals", async () => {
  const progress = await import("@/features/goals");
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
  it("writes both balances under the jar names, with no captions (2026-11-06)", () => {
    shelf();
    expect(screen.getByText("£8")).toBeInTheDocument();
    expect(screen.getByText("£31")).toBeInTheDocument();
    expect(screen.queryByText("Cash you have")).toBeNull();
    expect(screen.queryByText("Kept by your parent")).toBeNull();
  });

  it("keeps the goal off the jars: its words live in the goal card", () => {
    shelf();
    expect(screen.queryByText("⚽ Football boots, £45.")).toBeNull();
    expect(screen.queryByText(/to go/)).toBeNull();
    // The actions wait in the jar's tray until the jar is tapped.
    expect(screen.queryByRole("button", { name: "Change my goal" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    expect(screen.getByRole("button", { name: "Change my goal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take out" })).toBeInTheDocument();
  });

  it("offers a goal when there is none", () => {
    shelf({ goal: null });
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    expect(screen.getByRole("button", { name: "Set a goal" })).toBeInTheDocument();
  });

  it("opens one tray at a time and explains only what the drawing shows", () => {
    shelf({ goal: null, availability: { ...availability, reservedSaveMinor: 0 } });
    expect(screen.queryByRole("list", { name: "What the jars show" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Spend/ }));
    expect(screen.getByRole("button", { name: "Put in" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    expect(screen.queryByRole("button", { name: "Put in" })).toBeNull();
    expect(screen.getByRole("button", { name: "Take out" })).toBeInTheDocument();
  });

  it("heads the jars and says, in plain words, when money is on its way", () => {
    shelf({ dueMinor: 500 });
    expect(screen.getByRole("region", { name: "Your jars" })).toBeInTheDocument();
    expect(screen.getByText("£5 is on its way")).toBeInTheDocument();
  });

  it("puts open requests under the jar they affect", () => {
    shelf({
      openRequests: [
        request({}),
        request({ id: "r2", status: "approved", amountMinor: 200 }),
        request({ id: "r3", kind: "deposit", amountMinor: 300 }),
        request({ id: "r4", kind: "emergency", amountMinor: 400, reason: "School trip" }),
        request({ id: "r5", kind: "emergency", status: "approved", amountMinor: 600 }),
      ],
    });
    expect(screen.getByText("£5 asked from Save · waiting for your parent")).toBeInTheDocument();
    expect(screen.getByText("£2 from Save · your parent said yes")).toBeInTheDocument();
    expect(screen.getByText("£3 to Save · give it to your parent")).toBeInTheDocument();
    // Extra money is new money for Spend, so it sits under the Spend jar.
    const spend = screen.getByRole("region", { name: "Spend jar" });
    expect(spend).toHaveTextContent("£4 extra asked · waiting for your parent");
    expect(spend).toHaveTextContent("£6 extra · your parent said yes");
  });

  it("lets the drawing speak for itself: no legend under the jars (2026-11-06)", () => {
    shelf();
    expect(screen.queryByRole("list", { name: "What the jars show" })).toBeNull();
    expect(screen.queryByText("Waiting to come out")).toBeNull();
  });

  it("flies coins from Save to Spend when a take-out lands, and out of Spend for a purchase", () => {
    const props = {
      currency: "GBP",
      userId: "c1",
      rules: [],
      goal: null,
      allowanceMinor: 500,
      dueMinor: 0,
      openRequests: [],
    };
    const { container, rerender } = render(<JarShelf {...props} availability={availability} />);
    expect(container.querySelector("[data-coin-flight]")).toBeNull();
    rerender(
      <JarShelf {...props} availability={{ ...availability, spendMinor: 1300, saveMinor: 2600 }} />,
    );
    expect(container.querySelector("[data-coin-flight]")).toHaveAttribute(
      "data-coin-flight",
      "save-spend",
    );
    rerender(
      <JarShelf {...props} availability={{ ...availability, spendMinor: 900, saveMinor: 2600 }} />,
    );
    expect(container.querySelector("[data-coin-flight]")).toHaveAttribute(
      "data-coin-flight",
      "spend-out",
    );
  });

  it("flies coins on first paint only when told a move just landed", () => {
    const { container } = render(
      <JarShelf
        currency="GBP"
        userId="c1"
        availability={availability}
        rules={[]}
        goal={null}
        allowanceMinor={500}
        dueMinor={0}
        openRequests={[]}
        justMoved={{ from: "spend", to: "save" }}
      />,
    );
    expect(container.querySelector("[data-coin-flight]")).toHaveAttribute(
      "data-coin-flight",
      "spend-save",
    );
  });
});
