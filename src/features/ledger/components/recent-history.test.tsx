import { cleanup, render, screen } from "@testing-library/react";
import type { Route } from "next";
import { afterEach, describe, expect, it } from "vitest";
import type { HistoryItem } from "../types";
import { RecentHistory } from "./recent-history";

afterEach(cleanup);

const items = (count: number): HistoryItem[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `h${i}`,
    kind: "gift",
    amountMinor: 100 * (i + 1),
    dueMinor: null,
    label: `Gift ${i + 1}`,
    occurredOn: "2026-11-01",
    undone: false,
    entryId: null,
    canUndo: false,
  }));

const href = "/parent/children/c1/history" as Route;

describe("RecentHistory", () => {
  it("shows every line and no See all with five or fewer", () => {
    render(<RecentHistory items={items(5)} currency="GBP" seeAllHref={href} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByRole("link", { name: /See all/ })).not.toBeInTheDocument();
  });

  it("shows the newest five and links to the rest with more", () => {
    render(<RecentHistory items={items(6)} currency="GBP" seeAllHref={href} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByText("Gift 6")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See all history" })).toHaveAttribute("href", href);
  });
});
