import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PredictStep } from "./predict-step";

afterEach(cleanup);

const goal = { name: "bike", emoji: "🚲", targetMinor: 12000, planMinor: 800 };

function show(amountMinor: number | null, onTryAmount?: (minor: number) => void) {
  return render(
    <PredictStep
      move="take_out"
      amountMinor={amountMinor}
      goal={goal}
      saveMinor={6400}
      reservedMinor={0}
      currency="GBP"
      maxMinor={6400}
      onTryAmount={onTryAmount}
    />,
  );
}

describe("PredictStep", () => {
  it("shows nothing until there is an amount to predict about", () => {
    const { container } = show(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("asks for a guess, then reveals the real answer without moving money", () => {
    show(1600);
    expect(screen.getByText(/what happens to your goal/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Closer" }));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Not quite.");
    expect(status).toHaveTextContent(
      "about 9 allowances away instead of 7 allowances: further off",
    );
    // Guesses lock once answered; the right one is marked.
    expect(screen.getByRole("button", { name: "Further off" })).toBeDisabled();
  });

  it("says so when the guess is right", () => {
    show(1600);
    fireEvent.click(screen.getByRole("button", { name: "Further off" }));
    expect(screen.getByRole("status")).toHaveTextContent("That's it.");
  });

  it("offers the what-if slider only after the reveal, so the guess comes first", () => {
    show(1600, vi.fn());
    expect(screen.queryByText(/Try another amount/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Further off" }));
    expect(
      screen.getByText(/Try another amount. Nothing moves until you decide./),
    ).toBeInTheDocument();
    // Until the slider moves, there is nothing different to use.
    expect(screen.queryByRole("button", { name: "Use this amount" })).not.toBeInTheDocument();
  });
});
