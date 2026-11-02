import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CoachSays } from "@/components/brand/coach-says";
import { coachIdFor, coachLine, coachNames } from "@/components/brand/coaches";

afterEach(cleanup);

describe("CoachSays", () => {
  it("shows the coach with its name and the line it says for the moment", () => {
    const { container } = render(<CoachSays coach="bo" says={{ moment: "doneForNow" }} />);
    expect(screen.getByText("Bo")).toBeVisible();
    expect(screen.getByText(coachLine("bo", "doneForNow"))).toBeVisible();
    expect(container.querySelector("[data-coach=bo]")).toHaveAttribute("aria-hidden", "true");
  });

  it("picks the page's coach by key, the same one every time, and names it for AT when small", () => {
    const id = coachIdFor("inbox");
    const { container } = render(
      <CoachSays coach={{ key: "inbox" }} says="Nothing here yet." size="sm" />,
    );
    expect(container.querySelector("[data-coach-says]")).toHaveAttribute("data-coach-says", id);
    expect(screen.getByRole("img", { name: coachNames[id] })).toBeInTheDocument();
    expect(screen.getByText("Nothing here yet.")).toBeVisible();
    expect(screen.queryByText(coachNames[id])).toBeNull();
  });

  it("keeps anything passed under the line inside the bubble", () => {
    render(
      <CoachSays coach="nell" says="Come back any time.">
        <button type="button">Sign out</button>
      </CoachSays>,
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});
