import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CategoryChips } from "@/features/diary/components/category-chips";
import { SPEND_CATEGORIES } from "@/features/ledger";

afterEach(cleanup);

function setup(value: string | null = null) {
  const onChange = vi.fn();
  const { container } = render(
    <CategoryChips
      options={SPEND_CATEGORIES}
      kind="purchase"
      value={value}
      onChange={onChange}
      legend="What was it for?"
    />,
  );
  return { onChange, container };
}

describe("CategoryChips", () => {
  it("is a group named by its legend with one radio per option", () => {
    setup();
    expect(screen.getByRole("group", { name: "What was it for?" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(SPEND_CATEGORIES.length);
  });

  it("names each chip by its label; its icon is a line icon, not an emoji, and hidden", () => {
    const { container } = setup();
    expect(screen.getByRole("radio", { name: "Snacks" })).toBeInTheDocument();
    expect(container.querySelector('svg[data-category="snacks"]')).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText("🍫")).toBeNull();
  });

  it("calls onChange with the key when a chip is chosen", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Snacks" }));
    expect(onChange).toHaveBeenCalledWith("snacks");
  });

  it("marks only the chosen chip and posts it as category", () => {
    const { container } = setup("games");
    expect(screen.getByRole("radio", { name: "Games" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Snacks" })).not.toBeChecked();
    expect(container.querySelector('input[type="hidden"][name="category"]')).toHaveValue("games");
  });

  it("posts nothing until one is chosen", () => {
    const { container } = setup(null);
    expect(container.querySelector('input[name="category"]')).toHaveValue("");
  });
});
