import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Notice } from "../types";
import { InboxItem } from "./inbox-item";

const notice: Notice = {
  id: "7b0f6a52-3c1e-4b52-9d52-0a6f3a1d1b11",
  kind: "allowance_due",
  childId: "c1",
  childName: "Sam",
  sourceType: "allowance_occurrence",
  sourceId: "s1",
  payload: {},
  createdAt: new Date().toISOString(),
  read: false,
};

afterEach(cleanup);

function renderItem(overrides: Partial<Notice> = {}, onOpen = vi.fn()) {
  render(
    <InboxItem
      notice={{ ...notice, ...overrides }}
      href="/child"
      title="Your £5 allowance is due"
      detail="Your parent will hand it over."
      onOpen={onOpen}
    />,
  );
  return onOpen;
}

describe("InboxItem", () => {
  it("marks an unread item and tints it teal-100", () => {
    renderItem();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("data-unread", "true");
    expect(link.className).toContain("bg-teal-100");
  });

  it("does not mark a read item", () => {
    renderItem({ read: true });
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("data-unread", "false");
    expect(link.className).not.toContain("bg-teal-100");
  });

  it("links to href and shows title and detail", () => {
    renderItem();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/child");
    expect(screen.getByText("Your £5 allowance is due")).toBeInTheDocument();
    expect(screen.getByText("Your parent will hand it over.")).toBeInTheDocument();
  });

  it("calls onOpen with the id when clicked", () => {
    const onOpen = renderItem();
    fireEvent.click(screen.getByRole("link"));
    expect(onOpen.mock.calls[0]?.[0]).toBe(notice.id);
  });
});
