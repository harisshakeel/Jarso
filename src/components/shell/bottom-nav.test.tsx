import { cleanup, render, screen } from "@testing-library/react";
import { HomeIcon, InboxIcon } from "lucide-react";
import type { Route } from "next";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomNav } from "./bottom-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/child/inbox" }));

const items = [
  { href: "/child" as Route, label: "Home", icon: HomeIcon },
  { href: "/child/inbox" as Route, label: "Inbox", icon: InboxIcon, count: 1250 },
];

afterEach(cleanup);

describe("BottomNav", () => {
  it("renders only the tabs it is given, in a labelled nav", () => {
    render(<BottomNav items={items} />);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("marks the deepest matching tab as current", () => {
    render(<BottomNav items={items} />);
    expect(screen.getByRole("link", { name: /Inbox/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("shows counts in full, never abbreviated", () => {
    render(<BottomNav items={items} />);
    expect(screen.getByText("1,250")).toBeInTheDocument();
  });
});
