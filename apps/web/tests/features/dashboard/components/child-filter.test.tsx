import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChildFilter } from "@/features/dashboard/components/child-filter";
import { FILTER_KEY } from "@/features/dashboard/hrefs";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

const items = [
  { id: "aisha-id", nickname: "Aisha", slot: 1 },
  { id: "zarrar-id", nickname: "Zarrar", slot: 2 },
];

beforeEach(() => {
  replace.mockReset();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ChildFilter", () => {
  it("offers everyone and each child, marking the current choice, keeping the period", () => {
    render(
      <ChildFilter
        basePath="/parent"
        items={items}
        current={null}
        explicit
        keep={{ period: "30" }}
      />,
    );
    const everyone = screen.getByRole("link", { name: "Everyone" });
    expect(everyone).toHaveAttribute("aria-current", "true");
    expect(everyone).toHaveAttribute("href", "/parent?period=30&child=all");
    // "Aisha only", so the child tile's own "Aisha" link stays unique on the page.
    const aisha = screen.getByRole("link", { name: "Aisha only" });
    expect(aisha).toHaveAttribute("href", "/parent?period=30&child=aisha-id");
    expect(aisha).not.toHaveAttribute("aria-current");
  });

  it("remembers the choice on this device", () => {
    render(<ChildFilter basePath="/parent" items={items} current={null} explicit />);
    fireEvent.click(screen.getByRole("link", { name: "Zarrar only" }));
    expect(window.localStorage.getItem(FILTER_KEY)).toBe("zarrar-id");
  });

  it("brings back the remembered child when the address names no choice", () => {
    window.localStorage.setItem(FILTER_KEY, "zarrar-id");
    render(
      <ChildFilter
        basePath="/parent"
        items={items}
        current={null}
        explicit={false}
        keep={{ period: "7" }}
      />,
    );
    expect(replace).toHaveBeenCalledWith("/parent?period=7&child=zarrar-id", { scroll: false });
  });

  it("leaves the page alone for an explicit choice, a stranger's id or everyone remembered", () => {
    window.localStorage.setItem(FILTER_KEY, "zarrar-id");
    const { unmount } = render(
      <ChildFilter basePath="/parent" items={items} current="aisha-id" explicit />,
    );
    unmount();
    window.localStorage.setItem(FILTER_KEY, "someone-else");
    render(<ChildFilter basePath="/parent" items={items} current={null} explicit={false} />);
    cleanup();
    window.localStorage.setItem(FILTER_KEY, "all");
    render(<ChildFilter basePath="/parent" items={items} current={null} explicit={false} />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("still works when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<ChildFilter basePath="/parent" items={items} current={null} explicit={false} />);
    fireEvent.click(screen.getByRole("link", { name: "Aisha only" }));
    expect(replace).not.toHaveBeenCalled();
  });

  it("is not shown for a family of one", () => {
    const { container } = render(
      <ChildFilter basePath="/parent" items={items.slice(0, 1)} current={null} explicit />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
