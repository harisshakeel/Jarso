import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UndoButton } from "./undo-button";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("../server/actions", () => ({ undoPurchaseAction: vi.fn() }));

afterEach(cleanup);

describe("UndoButton", () => {
  it("names the button after the purchase it undoes", () => {
    render(<UndoButton entryId="e1" label="Comic" />);
    expect(screen.getByRole("button", { name: "Undo Comic" })).toHaveTextContent("Undo");
  });
});
