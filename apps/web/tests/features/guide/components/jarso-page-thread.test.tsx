import type { AskGuideResult, ThreadMessage } from "@jarso/core/guide";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Route } from "next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JarsoPageThread } from "@/features/guide/components/jarso-page-thread";

const { sendGuideTurn, newId, replace } = vi.hoisted(() => ({
  sendGuideTurn: vi.fn(),
  newId: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@jarso/core/guide", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@jarso/core/guide")>()),
  sendGuideTurn,
}));
vi.mock("@/features/guide/server/actions", () => ({ rateGuideMessageAction: vi.fn() }));
vi.mock("@/features/offline", () => ({
  newId,
  runOnline: (action: () => Promise<unknown>) => action(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

Element.prototype.scrollIntoView = vi.fn();

const answer: AskGuideResult = {
  conversationId: "convo-1",
  turnsLeft: 11,
  reply: {
    messageId: "m2",
    role: "guide",
    text: "Saving means keeping some money for later.",
    route: "on_topic",
    topics: [{ key: "saving-goal", title: "Saving up for something" }],
    check: null,
    helplines: [],
    lookedAt: [],
    remembered: [],
  },
};

const stored: ThreadMessage[] = [
  { id: "m1", from: "child", text: "What is saving?" },
  {
    id: "m2",
    from: "guide",
    reply: { ...answer.reply, topics: [], rating: null },
  },
];

const href = "/child/jarso" as Route;

beforeEach(() => {
  vi.clearAllMocks();
  newId.mockReturnValue("id-1");
  sendGuideTurn.mockResolvedValue({ ok: true, data: answer });
});
afterEach(cleanup);

describe("JarsoPageThread", () => {
  it("moves the page to the started chat and keeps the live reply through the move", async () => {
    const { rerender } = render(
      <JarsoPageThread chatHref={href} chatId={null} nonce={null} introNeeded={false} />,
    );
    fireEvent.change(screen.getByLabelText("Your question for Jarso"), {
      target: { value: "What is saving?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("Saving means keeping some money for later.");
    // The move happens in an effect after the reply has rendered.
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/child/jarso?chat=convo-1", { scroll: false }),
    );
    // The page re-renders with the chat's address and its stored copy: the thread that started
    // it is not re-keyed, so the topic chip the stored copy lacks is still there.
    rerender(
      <JarsoPageThread
        chatHref={href}
        chatId="convo-1"
        nonce={null}
        introNeeded={false}
        reopened={{ conversationId: "convo-1", turnsLeft: 11, messages: stored }}
      />,
    );
    expect(screen.getByRole("link", { name: "Saving up for something" })).toBeVisible();
    // The re-render hands the thread a new callback; the started chat must not move the page again.
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("keeps the live reply when a chat started from New chat moves to its address", async () => {
    const { rerender } = render(
      <JarsoPageThread chatHref={href} chatId={null} nonce="a1b2" introNeeded={false} />,
    );
    fireEvent.change(screen.getByLabelText("Your question for Jarso"), {
      target: { value: "What is saving?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("Saving means keeping some money for later.");
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/child/jarso?chat=convo-1", { scroll: false }),
    );
    // The new address drops `?new=`, so the nonce is gone: the thread must not be re-keyed.
    rerender(
      <JarsoPageThread
        chatHref={href}
        chatId="convo-1"
        nonce={null}
        introNeeded={false}
        reopened={{ conversationId: "convo-1", turnsLeft: 11, messages: stored }}
      />,
    );
    expect(screen.getByText("Saving means keeping some money for later.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Saving up for something" })).toBeVisible();
  });

  it("starts over on New chat, and reopens a chat picked from the list", () => {
    const { rerender } = render(
      <JarsoPageThread
        chatHref={href}
        chatId="convo-1"
        nonce={null}
        introNeeded={false}
        reopened={{ conversationId: "convo-1", turnsLeft: 11, messages: stored }}
      />,
    );
    expect(screen.getByText("Saving means keeping some money for later.")).toBeVisible();
    rerender(<JarsoPageThread chatHref={href} chatId={null} nonce="a1b2" introNeeded={false} />);
    expect(screen.queryByText("Saving means keeping some money for later.")).toBeNull();
    rerender(
      <JarsoPageThread
        chatHref={href}
        chatId="convo-1"
        nonce={null}
        introNeeded={false}
        reopened={{ conversationId: "convo-1", turnsLeft: 11, messages: stored }}
      />,
    );
    expect(screen.getByText("Saving means keeping some money for later.")).toBeVisible();
  });
});
