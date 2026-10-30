import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuideSheet } from "./guide-sheet";

const { askGuideAction, newId } = vi.hoisted(() => ({
  askGuideAction: vi.fn(),
  newId: vi.fn(),
}));

vi.mock("../server/actions", () => ({ askGuideAction, rateGuideMessageAction: vi.fn() }));
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
