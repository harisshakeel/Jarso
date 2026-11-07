import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NeedsYou } from "@/features/allowance/components/needs-you";

afterEach(cleanup);

describe("NeedsYou", () => {
  it("is all caught up only when nothing at all is waiting", () => {
    render(<NeedsYou items={[]} currency="GBP" otherCount={0} />);
    expect(screen.getByText("All caught up.")).toBeInTheDocument();
  });

  it("does not say all caught up while requests or notices wait", () => {
    render(<NeedsYou items={[]} currency="GBP" otherCount={2} />);
    expect(screen.queryByText("All caught up.")).toBeNull();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("lists each handover in one row, oldest first, saying how long it has waited", () => {
    render(
      <NeedsYou
        items={[
          {
            kind: "allowance",
            id: "o1",
            childId: "z",
            nickname: "Zarrar",
            dueOn: "2026-10-30",
            amountMinor: 7500,
            note: null,
            plannedSaveMinor: null,
          },
          {
            kind: "allowance",
            id: "o2",
            childId: "a",
            nickname: "Ayesha",
            dueOn: "2026-11-04",
            amountMinor: 9000,
            note: null,
            plannedSaveMinor: null,
          },
        ]}
        currency="USD"
        today="2026-11-04"
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Zarrar");
    expect(rows[0]).toHaveTextContent("5 days ago");
    // Due today: no age, and never "overdue" or "missed".
    expect(rows[1]).not.toHaveTextContent("ago");
    expect(document.body).not.toHaveTextContent(/overdue|missed/i);
    expect(
      screen.getByRole("link", { name: /^Hand over allowance to Zarrar, due / }),
    ).toBeVisible();
    // The child is named in the row, not as a heading or a link of their own.
    expect(screen.queryByRole("heading", { name: "Zarrar" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Zarrar" })).toBeNull();
  });
});
