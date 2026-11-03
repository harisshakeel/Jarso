import type { ConversationSummary } from "@jarso/core/guide";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Route } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatHistory, groupChats } from "@/features/guide/components/chat-history";

// Only the clock is faked, so the drawer still opens; its timers stay real.
beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const now = new Date("2026-11-03T10:00:00Z");

function chat(
  id: string,
  lastMessageAt: string,
  preview: string,
  childId = "c1",
): ConversationSummary {
  return {
    id,
    childId,
    entry: "home",
    label: "Home",
    createdAt: lastMessageAt,
    lastMessageAt,
    turns: 1,
    flagged: false,
    preview,
  };
}

const chats = [
  chat("a", "2026-11-03T08:30:00Z", "How much do I have?"),
  chat("b", "2026-10-30T18:00:00Z", "What is saving?", "c2"),
  chat("c", "2026-10-01T12:00:00Z", "When is my next allowance?"),
];

describe("groupChats", () => {
  it("groups chats into today, this week and earlier, in the family's timezone", () => {
    const groups = groupChats(chats, now, "Europe/London");
    expect(groups.map((g) => [g.name, g.chats.map((c) => c.id)])).toEqual([
      ["Today", ["a"]],
      ["This week", ["b"]],
      ["Earlier", ["c"]],
    ]);
    // An hour and a half from now is still today in London, but already tomorrow in Auckland.
    const late = chat("d", "2026-11-03T11:30:00Z", "Later");
    expect(groupChats([late], now, "Europe/London")[0]?.name).toBe("Today");
    expect(groupChats([late], now, "Pacific/Auckland")[0]?.name).toBe("This week");
  });

  it("leaves out empty groups", () => {
    expect(groupChats([chats[2] as ConversationSummary], now, "UTC").map((g) => g.name)).toEqual([
      "Earlier",
    ]);
  });
});

describe("ChatHistory", () => {
  const props = {
    currentId: "b",
    chatHref: "/parent/jarso" as Route,
    newHref: "/parent/jarso?new=abcd" as Route,
    timezone: "UTC",
    names: { c1: "Sam", c2: "Mia" },
  };

  it("shows nothing about past chats until History is opened, then the groups and New chat", () => {
    render(<ChatHistory chats={chats} {...props} />);
    expect(screen.queryByRole("link", { name: "New chat" })).toBeNull();
    expect(screen.queryByText("How much do I have?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByRole("link", { name: "New chat" })).toHaveAttribute(
      "href",
      "/parent/jarso?new=abcd",
    );
    expect(screen.getByText("Today")).toBeVisible();
    expect(screen.getByText("This week")).toBeVisible();
    expect(screen.getByText("Earlier")).toBeVisible();
    const current = screen.getByRole("link", { name: /What is saving\?/ });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveAttribute("href", "/parent/jarso?chat=b");
    expect(current).toHaveTextContent("Mia");
  });

  it("says when there are no chats yet", () => {
    render(<ChatHistory chats={[]} {...props} currentId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByText("No chats yet.")).toBeVisible();
    expect(screen.getByRole("link", { name: "New chat" })).toBeVisible();
  });
});
