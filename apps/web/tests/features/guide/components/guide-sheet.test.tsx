import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuideSheet } from "@/features/guide/components/guide-sheet";

const { askGuideAction, newId } = vi.hoisted(() => ({
  askGuideAction: vi.fn(),
  newId: vi.fn(),
}));

vi.mock("@/features/guide/server/actions", () => ({
  askGuideAction,
  rateGuideMessageAction: vi.fn(),
}));
vi.mock("@/features/offline", () => ({
  newId,
  runOnline: (action: () => Promise<unknown>) => action(),
}));

// jsdom has no layout, so no scrollIntoView.
Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  newId.mockReturnValueOnce("id-1").mockReturnValueOnce("id-2");
});
afterEach(cleanup);

const sheet = <GuideSheet context={{ entry: "home" }} introNeeded={false} triggerLabel="Ask" />;

function ask(question: string) {
  fireEvent.change(screen.getByLabelText("Your question"), { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

describe("GuideSheet message id", () => {
  it("mints nothing while rendering, so server and client HTML match", () => {
    renderToString(sheet);
    render(sheet);
    expect(newId).not.toHaveBeenCalled();
  });

  it("mints the id with newId on submit and reuses it to re-send the same question", async () => {
    askGuideAction.mockResolvedValue({
      ok: false,
      error: { code: "UNAVAILABLE", message: "This is taking a while. Try again?" },
    });
    render(sheet);
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    ask("What is saving?");
    await waitFor(() => expect(askGuideAction).toHaveBeenCalledTimes(1));
    await screen.findByText("This is taking a while. Try again?");
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(askGuideAction).toHaveBeenCalledTimes(2));

    const ids = askGuideAction.mock.calls.map(([, input]) => input.clientMessageId);
    expect(ids).toEqual(["id-1", "id-1"]);
    expect(newId).toHaveBeenCalledOnce();
  });
});

describe("GuideSheet opener", () => {
  const helpMe = (introNeeded: boolean) => (
    <GuideSheet
      context={{ entry: "home" }}
      introNeeded={introNeeded}
      triggerLabel="Help me"
      opener="Can you give me a hint?"
    />
  );
  const answered = {
    ok: true,
    data: {
      conversationId: "c-1",
      turnsLeft: 9,
      reply: {
        messageId: "m-1",
        role: "guide",
        text: "Compare what you have with what it costs.",
        route: "on_topic",
        topics: [],
        check: null,
        helplines: [],
        lookedAt: [],
        remembered: [],
      },
    },
  };

  it("asks the opener as the sheet opens, so Jarso starts answering", async () => {
    askGuideAction.mockResolvedValue(answered);
    render(helpMe(false));
    fireEvent.click(screen.getByRole("button", { name: "Help me" }));
    await screen.findByText("Compare what you have with what it costs.");
    expect(askGuideAction).toHaveBeenCalledOnce();
    expect(askGuideAction.mock.calls[0]?.[1]).toMatchObject({
      text: "Can you give me a hint?",
      conversationId: null,
    });
    expect(screen.getByText("Can you give me a hint?")).toBeInTheDocument();
  });

  it("waits for Got it when the intro shows first", async () => {
    askGuideAction.mockResolvedValue(answered);
    render(helpMe(true));
    fireEvent.click(screen.getByRole("button", { name: "Help me" }));
    expect(askGuideAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    await screen.findByText("Compare what you have with what it costs.");
    expect(askGuideAction).toHaveBeenCalledOnce();
  });

  it("leaves the opener in the box when it fails, so Send tries again", async () => {
    askGuideAction.mockResolvedValue({
      ok: false,
      error: { code: "UNAVAILABLE", message: "This is taking a while. Try again?" },
    });
    render(helpMe(false));
    fireEvent.click(screen.getByRole("button", { name: "Help me" }));
    await screen.findByText("This is taking a while. Try again?");
    expect(screen.getByLabelText("Your question")).toHaveValue("Can you give me a hint?");
  });
});
