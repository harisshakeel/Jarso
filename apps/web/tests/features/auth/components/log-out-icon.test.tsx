import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogOutButton } from "@/features/auth/components/log-out-icon";

const { formAction } = vi.hoisted(() => ({ formAction: vi.fn() }));

vi.mock("@/features/auth/server/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/features/offline", () => ({
  useOnlineActionState: () => [null, formAction, false, vi.fn(), true],
}));

afterEach(() => {
  cleanup();
  formAction.mockReset();
});

describe("LogOutButton", () => {
  it("asks before logging out, and Stay keeps you signed in", async () => {
    render(<LogOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByText("Are you sure you want to log out?")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(formAction).not.toHaveBeenCalled();
  });

  it("shows red on hover", () => {
    render(<LogOutButton />);
    expect(screen.getByRole("button", { name: "Log out" })).toHaveClass("hover:text-destructive");
  });
});
