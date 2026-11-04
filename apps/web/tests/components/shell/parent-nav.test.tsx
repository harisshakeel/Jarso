import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParentNav } from "@/components/shell/parent-nav";

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
  it("has Home and Money tabs in a labelled nav", () => {
    render(<ParentNav />);
    expect(screen.getByRole("navigation", { name: "Parent" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/parent");
    expect(screen.getByRole("link", { name: "Money" })).toHaveAttribute(
      "href",
      "/parent/allowance",
    );
    expect(screen.getByRole("link", { name: "Jarso" })).toHaveAttribute("href", "/parent/jarso");
    expect(screen.getByRole("link", { name: "Children" })).toHaveAttribute(
      "href",
      "/parent/children",
    );
  });

  it.each([
    ["/parent", "Home"],
    ["/parent/children", "Children"],
    ["/parent/children/abc", "Children"],
    ["/parent/children/abc/allowance", "Children"],
    ["/parent/allowance", "Money"],
  ])("on %s lights %s", (path, tab) => {
    pathname.current = path;
    render(<ParentNav />);
    expect(current()).toEqual([tab]);
  });

  it("lights no tab on Settings, which the person at the foot of the sidebar opens", () => {
    pathname.current = "/parent/settings";
    render(<ParentNav />);
    expect(current()).toEqual([]);
  });
});
