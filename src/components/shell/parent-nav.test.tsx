import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParentNav } from "./parent-nav";

const pathname = vi.hoisted(() => ({ current: "/parent" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

afterEach(cleanup);

function current() {
  return screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);
}

describe("ParentNav", () => {
  it("has Home and Allowance tabs in a labelled nav", () => {
    render(<ParentNav />);
    expect(screen.getByRole("navigation", { name: "Parent" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/parent");
    expect(screen.getByRole("link", { name: "Allowance" })).toHaveAttribute(
      "href",
      "/parent/allowance",
    );
  });

  it.each([
    ["/parent", "Home"],
    ["/parent/children/abc", "Home"],
    ["/parent/children/abc/allowance", "Home"],
    ["/parent/allowance", "Allowance"],
  ])("on %s lights %s", (path, tab) => {
    pathname.current = path;
    render(<ParentNav />);
    expect(current()).toEqual([tab]);
  });
});
