import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SavedCardPanel, SavedCards } from "@/features/payments/components/saved-card-panel";

vi.mock("@/features/payments/server/actions", () => ({ removeSavedCardAction: vi.fn() }));

afterEach(cleanup);

describe("SavedCardPanel", () => {
  it("shows the card's brand and last 4 with a Remove button", () => {
    render(<SavedCardPanel provider="fake" card={{ brand: "visa", last4: "4242" }} />);
    expect(screen.getByText("Visa ending 4242")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove card" })).toBeInTheDocument();
  });

  it("explains how to save one when there is none", () => {
    render(<SavedCardPanel provider="fake" card={null} />);
    expect(screen.getByText(/No card saved/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove card" })).not.toBeInTheDocument();
  });
});

describe("SavedCards", () => {
  it("shows one panel without a title when one provider is on", () => {
    render(<SavedCards cards={[{ provider: "fake", label: "Test card", card: null }]} />);
    expect(screen.getByText(/No card saved/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Test card" })).not.toBeInTheDocument();
  });

  it("shows a titled panel per provider when several are on", () => {
    render(
      <SavedCards
        cards={[
          { provider: "stripe", label: "Stripe", card: { brand: "visa", last4: "4242" } },
          { provider: "fake", label: "Test card", card: null },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Stripe" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Test card" })).toBeInTheDocument();
    expect(screen.getByText("Visa ending 4242")).toBeInTheDocument();
    expect(screen.getByText(/No card saved/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remove card" })).toHaveLength(1);
  });
});
