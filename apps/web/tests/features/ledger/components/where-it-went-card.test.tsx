import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WhereItWentCard } from "@/features/ledger/components/where-it-went-card";

afterEach(cleanup);

describe("WhereItWentCard", () => {
  it("shows the sentences", () => {
    render(
      <WhereItWentCard
        view={{
          spent: {
            headline: "Most of your spending went on 🍫 Snacks: £7.",
            rest: ["Then 🎮 Games: £4."],
          },
          moneyIn: "You got £10: £10 allowance.",
          empty: null,
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Where your money went" })).toBeTruthy();
    expect(screen.getByText("Most of your spending went on 🍫 Snacks: £7.")).toBeTruthy();
    expect(screen.getByText("Then 🎮 Games: £4.")).toBeTruthy();
    expect(screen.getByText("You got £10: £10 allowance.")).toBeTruthy();
  });

  it("shows the empty line", () => {
    render(
      <WhereItWentCard
        view={{ spent: null, moneyIn: null, empty: "Nothing spent this week yet." }}
      />,
    );
    expect(screen.getByText("Nothing spent this week yet.")).toBeTruthy();
  });
});
