import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteError } from "@/components/shell/route-error";
import { routes } from "@/config";

afterEach(cleanup);

describe("RouteError", () => {
  it("is never a dead end: try again, or go home", () => {
    const retry = vi.fn();
    render(<RouteError error={new Error("boom")} retry={retry} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("That didn't load.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", routes.dashboard);
  });

  it("is the page's main landmark only at the root, where nothing else is", () => {
    const { unmount } = render(<RouteError as="main" error={null} retry={vi.fn()} />);
    expect(screen.getByRole("main")).toBeInTheDocument();
    unmount();
    render(<RouteError error={null} retry={vi.fn()} />);
    expect(screen.queryByRole("main")).toBeNull();
  });
});
