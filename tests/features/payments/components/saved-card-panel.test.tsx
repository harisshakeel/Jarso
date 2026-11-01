import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SavedCardPanel } from "@/features/payments/components/saved-card-panel";

vi.mock("@/features/payments/server/actions", () => ({ removeSavedCardAction: vi.fn() }));

afterEach(cleanup);

describe("SavedCardPanel", () => {
  it("shows the card's brand and last 4 with a Remove button", () => {
    render(<SavedCardPanel card={{ brand: "visa", last4: "4242" }} />);
    expect(screen.getByText("Visa ending 4242")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove card" })).toBeInTheDocument();
  });

  it("explains how to save one when there is none", () => {
    render(<SavedCardPanel card={null} />);
    expect(screen.getByText(/No card saved/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove card" })).not.toBeInTheDocument();
  });
});
