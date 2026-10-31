import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guideCopy } from "../copy";
import type { AskGuideResult } from "../types";
import { AskJarso } from "./ask-jarso";

const { sendGuideTurn, newId } = vi.hoisted(() => ({ sendGuideTurn: vi.fn(), newId: vi.fn() }));

vi.mock("../send-turn", () => ({ sendGuideTurn }));
vi.mock("../server/actions", () => ({ rateGuideMessageAction: vi.fn() }));
vi.mock("@/features/offline", () => ({
  newId,
  runOnline: (action: () => Promise<unknown>) => action(),
}));

// jsdom has no layout, so no scrollIntoView.
Element.prototype.scrollIntoView = vi.fn();

const answer: AskGuideResult = {
  conversationId: "convo-1",
  turnsLeft: 11,
  reply: {
    messageId: "reply-1",
    role: "guide",
    text: "You have £12.40 in Spend and £64 in Save.",
    route: "on_topic",
    topics: [],
    check: null,
    helplines: [],
    lookedAt: ["jars"],
    remembered: [],
  },
};

const askJarso = <AskJarso introNeeded={false} suggestions={["How much do I have?"]} />;

beforeEach(() => {
  vi.clearAllMocks();
  newId.mockReturnValue("id-1");
});
afterEach(cleanup);

describe("AskJarso", () => {
  it("mints nothing while rendering, so server and client HTML match", () => {
    renderToString(askJarso);
    render(askJarso);
    expect(newId).not.toHaveBeenCalled();
    expect(screen.getByText(guideCopy.disclosure)).toBeVisible();
  });

  it("shows each look-up while Jarso works, then the reply and what it looked at", async () => {
    let finish: (value: { ok: true; data: AskGuideResult }) => void = () => {};
    sendGuideTurn.mockImplementation(async (_request, onStatus: (line: string) => void) => {
      // Like the real stream: a status line arrives after the request has gone out.
      await Promise.resolve();
      onStatus(guideCopy.status.get_jars);
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    render(askJarso);
    fireEvent.click(screen.getByRole("button", { name: "How much do I have?" }));

    await screen.findByText(guideCopy.status.get_jars);
    expect(sendGuideTurn.mock.calls[0]?.[0]).toEqual({
      clientMessageId: "id-1",
      conversationId: null,
      context: { entry: "home" },
      text: "How much do I have?",
    });

    finish({ ok: true, data: answer });
    await screen.findByText("You have £12.40 in Spend and £64 in Save.");
    expect(screen.getByText("Looked at: jars")).toBeVisible();
    expect(screen.queryByText(guideCopy.status.get_jars)).toBeNull();
    // The suggestions give way to the chat.
    expect(screen.queryByRole("button", { name: "How much do I have?" })).toBeNull();
  });

  it("shows the intro card first for a child who has never chatted", () => {
    render(<AskJarso introNeeded suggestions={[]} />);
    expect(screen.getByText(guideCopy.intro[0])).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: guideCopy.introButton }));
    expect(screen.getByLabelText("Your question for Jarso")).toBeVisible();
  });

  it("shows a calm error and keeps the question to send again", async () => {
    sendGuideTurn.mockResolvedValue({
      ok: false,
      error: { code: "RATE_LIMITED", message: guideCopy.rateLimitedMinute },
    });
    render(askJarso);
    fireEvent.change(screen.getByLabelText("Your question for Jarso"), {
      target: { value: "What did I spend?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText(guideCopy.rateLimitedMinute);
    await waitFor(() =>
      expect(screen.getByLabelText("Your question for Jarso")).toHaveValue("What did I spend?"),
    );
  });
});
