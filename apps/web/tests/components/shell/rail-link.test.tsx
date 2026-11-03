import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RailLink } from "@/components/shell/rail-link";

const pathname = vi.hoisted(() => ({ current: "/child" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

afterEach(cleanup);

describe("RailLink", () => {
  it("is named for the page it opens and lights up while that page is open", () => {
    pathname.current = "/child/settings";
    render(
      <RailLink href="/child/settings" label="Me">
        Sam
      </RailLink>,
    );
    const link = screen.getByRole("link", { name: "Me" });
    expect(link).toHaveAttribute("href", "/child/settings");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("stays quiet on other pages", () => {
    pathname.current = "/child/diary";
    render(
      <RailLink href="/child/settings" label="Me">
        Sam
      </RailLink>,
    );
    expect(screen.getByRole("link", { name: "Me" })).not.toHaveAttribute("aria-current");
  });
});
