import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScoreStrip } from "@/features/learning/components/score-strip";

afterEach(cleanup);

describe("ScoreStrip", () => {
  it("shows points and days in a row", () => {
    render(<ScoreStrip points={120} streak={3} />);
    expect(screen.getByText("120 points")).toBeInTheDocument();
    expect(screen.getByText("3 days in a row.")).toBeInTheDocument();
  });

  it("invites a new run instead of saying one was lost", () => {
    render(<ScoreStrip points={0} streak={0} />);
    expect(screen.getByText("0 points")).toBeInTheDocument();
    expect(screen.getByText("Learn today to start a run.")).toBeInTheDocument();
    expect(screen.queryByText(/lost/i)).toBeNull();
  });
});
