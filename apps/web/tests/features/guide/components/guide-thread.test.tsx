import type { AskGuideResult, ThreadMessage } from "@jarso/core/guide";
import { guideCopy } from "@jarso/core/guide";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/** A reply's paragraph: money figures sit in their own spans, so match the whole paragraph. */
const paragraph = (text: string) => (_: string, element: Element | null) =>
  element?.tagName === "P" && element.textContent === text;
const reply = "You have £12.40 in Spend and £64 in Save.";

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
    expect(screen.getByText(paragraph(reply))).toBeVisible();
    expect(screen.getByText("Looked at:")).toBeVisible();
    expect(screen.getByText("jars")).toBeVisible();
    // Money figures sit in tabular numerals.
    expect(screen.getByText("£12.40")).toHaveClass("money");
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
    expect(screen.queryByText(paragraph(reply))).toBeNull();
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

/** A browser's speech recognition, as far as the microphone button uses it. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  interimResults = false;
  continuous = true;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();
  constructor() {
    FakeRecognition.instances.push(this);
  }
  hear(transcript: string, isFinal: boolean) {
    const result = Object.assign([{ transcript }], { isFinal });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
}

describe("GuideThread on the page", () => {
  it("greets the person over an empty chat, with the composer and cards in the middle", () => {
    render(
      <GuideThread
        variant="page"
        person="Zarrar"
        suggestions={[guideCopy.suggestions.jars, guideCopy.suggestions.learning]}
      />,
    );
    expect(screen.getByRole("region", { name: "Ask Jarso" })).toBeInTheDocument();
    expect(screen.getByText("Hi Zarrar. Ask me about your money.")).toBeVisible();
    expect(screen.getByText(guideCopy.disclosure)).toBeVisible();
    // A card's name is exactly its question; the hint under it is decoration.
    const card = screen.getByRole("button", { name: "How much do I have?" });
    expect(card).toHaveTextContent("Spend and Save, right now");
    expect(screen.getByRole("button", { name: "What should I learn next?" })).toBeVisible();
    expect(screen.getByLabelText("Your question for Jarso")).toBeVisible();
    expect(screen.queryByRole("list", { name: "Chat with Jarso" })).toBeNull();
  });

  it("greets a parent by first name about the picked child", () => {
    render(
      <GuideThread
        variant="page"
        audience="parent"
        person="Haris"
        kids={[{ id: "c1", nickname: "Zarrar" }]}
      />,
    );
    expect(screen.getByText("Hi Haris. Ask me anything about Zarrar's money.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Ask Jarso about Zarrar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "How is Zarrar doing with saving?" })).toBeVisible();
  });

  it("moves to the chat layout once a reply has landed", async () => {
    sendGuideTurn.mockResolvedValue({ ok: true, data: answer });
    render(<GuideThread variant="page" person="Zarrar" suggestions={["How much do I have?"]} />);
    fireEvent.click(screen.getByRole("button", { name: "How much do I have?" }));
    await screen.findByText("Spend is the cash you hold.");
    expect(screen.queryByText("Hi Zarrar. Ask me about your money.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Ask Jarso" })).toBeVisible();
    expect(screen.getByRole("list", { name: "Chat with Jarso" })).toBeVisible();
    expect(screen.queryByRole("list", { name: "Questions to try" })).toBeNull();
  });
});

describe("GuideThread voice input", () => {
  afterEach(() => {
    FakeRecognition.instances = [];
    vi.unstubAllGlobals();
  });

  it("hears a question into the box after what was typed, and waits for Ask", async () => {
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    render(<GuideThread />);
    const box = screen.getByLabelText("Your question for Jarso");
    fireEvent.change(box, { target: { value: "How much" } });
    const mic = await screen.findByRole("button", { name: "Speak your question" });
    fireEvent.click(mic);
    const recognition = FakeRecognition.instances[0] as FakeRecognition;
    expect(recognition.start).toHaveBeenCalled();
    expect(recognition.interimResults).toBe(true);
    expect(recognition.continuous).toBe(false);
    expect(mic).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent(guideCopy.voice.listening);
    act(() => recognition.hear("do I", false));
    expect(box).toHaveValue("How much do I");
    act(() => recognition.hear("do I have", true));
    expect(box).toHaveValue("How much do I have");
    act(() => recognition.onend?.());
    expect(mic).toHaveAttribute("aria-pressed", "false");
    expect(sendGuideTurn).not.toHaveBeenCalled();
  });

  it("says so calmly when it could not hear, and hides where the browser cannot listen", async () => {
    vi.stubGlobal("SpeechRecognition", FakeRecognition);
    const { unmount } = render(<GuideThread />);
    fireEvent.click(await screen.findByRole("button", { name: "Speak your question" }));
    const recognition = FakeRecognition.instances[0] as FakeRecognition;
    act(() => {
      recognition.onerror?.({ error: "not-allowed" });
      recognition.onend?.();
    });
    expect(screen.getByRole("status")).toHaveTextContent(guideCopy.voice.failed);
    unmount();
    vi.unstubAllGlobals();
    render(<GuideThread />);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Speak your question" })).toBeNull(),
    );
  });
});
