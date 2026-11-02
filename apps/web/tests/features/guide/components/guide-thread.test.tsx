import type { AskGuideResult, ThreadMessage } from "@jarso/core/guide";
import { guideCopy } from "@jarso/core/guide";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Route } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuideThread } from "@/features/guide/components/guide-thread";

const { sendGuideTurn, newId } = vi.hoisted(() => ({ sendGuideTurn: vi.fn(), newId: vi.fn() }));

vi.mock("@jarso/core/guide", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@jarso/core/guide")>()),
  sendGuideTurn,
}));
vi.mock("@/features/guide/server/actions", () => ({ rateGuideMessageAction: vi.fn() }));
vi.mock("@/features/offline", () => ({
  newId,
  runOnline: (action: () => Promise<unknown>) => action(),
}));

Element.prototype.scrollIntoView = vi.fn();

const stored: ThreadMessage[] = [
  { id: "m1", from: "child", text: "How much do I have?" },
  {
    id: "m2",
    from: "guide",
    reply: {
      messageId: "m2",
      rating: 1,
      role: "guide",
      text: "You have £12.40 in Spend and £64 in Save.",
      route: "on_topic",
      topics: [],
      check: null,
      helplines: [],
      lookedAt: ["jars"],
      remembered: [],
    },
  },
];

const answer: AskGuideResult = {
  conversationId: "convo-1",
  turnsLeft: 10,
  reply: {
    messageId: "m4",
    role: "guide",
    text: "Spend is the cash you hold.",
    route: "on_topic",
    topics: [],
    check: null,
    helplines: [],
    lookedAt: [],
    remembered: [],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  newId.mockReturnValue("id-1");
});
afterEach(cleanup);

describe("GuideThread", () => {
  it("picks a chat up again: its messages, thumbs and turns, and continues it", async () => {
    sendGuideTurn.mockResolvedValue({ ok: true, data: answer });
    render(
      <GuideThread
        variant="page"
        reopened={{ conversationId: "convo-1", turnsLeft: 11, messages: stored }}
      />,
    );
    expect(screen.getByText("You have £12.40 in Spend and £64 in Save.")).toBeVisible();
    expect(screen.getByText("Looked at: jars")).toBeVisible();
    expect(screen.getByRole("button", { name: "Helpful" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("list", { name: "Questions to try" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Your question for Jarso"), {
      target: { value: "What is Spend?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("Spend is the cash you hold.");
    expect(sendGuideTurn.mock.calls[0]?.[0]).toMatchObject({
      conversationId: "convo-1",
      context: { entry: "home" },
    });
  });

  it("says when a reopened chat is full and offers a new one instead of the composer", () => {
    const onChatStarted = vi.fn();
    render(
      <GuideThread
        variant="page"
        reopened={{ conversationId: "convo-1", turnsLeft: 0, messages: stored }}
        onChatStarted={onChatStarted}
      />,
    );
    expect(screen.getByText(guideCopy.chatFull)).toBeVisible();
    expect(screen.queryByLabelText("Your question for Jarso")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: guideCopy.newChat }));
    expect(screen.getByLabelText("Your question for Jarso")).toBeVisible();
    expect(screen.queryByText("You have £12.40 in Spend and £64 in Save.")).toBeNull();
  });

  it("tells the page when a new chat has its first reply, and links to the full page", async () => {
    sendGuideTurn.mockResolvedValue({ ok: true, data: answer });
    const onChatStarted = vi.fn();
    render(
      <GuideThread
        suggestions={["How much do I have?"]}
        openHref={"/child/jarso" as Route}
        onChatStarted={onChatStarted}
      />,
    );
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/child/jarso");
    fireEvent.click(screen.getByRole("button", { name: "How much do I have?" }));
    await screen.findByText("Spend is the cash you hold.");
    expect(onChatStarted).toHaveBeenCalledWith("convo-1");
  });

  it("keeps a parent's reopened chat about one child, without the child picker", () => {
    render(
      <GuideThread
        audience="parent"
        kids={[
          { id: "c1", nickname: "Sam" },
          { id: "c2", nickname: "Mia" },
        ]}
        reopened={{
          conversationId: "convo-1",
          turnsLeft: 11,
          messages: stored,
          kid: { id: "c2", nickname: "Mia" },
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Ask Jarso about Mia" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Sam" })).toBeNull();
  });
});
