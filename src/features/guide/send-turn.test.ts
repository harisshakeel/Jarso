// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { guideCopy } from "./copy";
import { sendGuideTurn } from "./send-turn";
import type { AskGuideResult } from "./types";

const request = {
  clientMessageId: "00000000-0000-4000-8000-000000000001",
  conversationId: null,
  context: { entry: "home" as const },
  text: "How much do I have?",
};

const data: AskGuideResult = {
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

/** A streamed response whose body arrives in exactly these byte chunks. */
function streamed(chunks: Uint8Array[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "application/x-ndjson" } },
  );
}

function stub(response: Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("sendGuideTurn", () => {
  it("reads status lines then the reply, across split lines and characters", async () => {
    const bytes = new TextEncoder().encode(
      `${JSON.stringify({ type: "status", text: guideCopy.status.get_jars })}\n${JSON.stringify({ type: "reply", data })}\n`,
    );
    // Cut inside the first line, and inside the two bytes of "£".
    const pound = bytes.indexOf(0xc2);
    stub(streamed([bytes.slice(0, 10), bytes.slice(10, pound + 1), bytes.slice(pound + 1)]));
    const statuses: string[] = [];
    const result = await sendGuideTurn(request, (line) => statuses.push(line));
    expect(statuses).toEqual([guideCopy.status.get_jars]);
    expect(result).toEqual({ ok: true, data });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/v1/guide/turns",
      expect.objectContaining({ method: "POST", body: JSON.stringify(request) }),
    );
  });

  it("returns an error line as a failed result", async () => {
    const line = { type: "error", error: { code: "CONFLICT", message: guideCopy.chatFull } };
    stub(streamed([new TextEncoder().encode(`${JSON.stringify(line)}\n`)]));
    await expect(sendGuideTurn(request, () => {})).resolves.toEqual({
      ok: false,
      error: { code: "CONFLICT", message: guideCopy.chatFull },
    });
  });

  it("reads a checked-and-refused request's JSON envelope, field errors included", async () => {
    stub(
      new Response(
        JSON.stringify({
          error: {
            code: "VALIDATION",
            message: "Invalid request",
            details: { fieldErrors: { text: ["Type a question first."] } },
          },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(sendGuideTurn(request, () => {})).resolves.toEqual({
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Invalid request",
        fieldErrors: { text: ["Type a question first."] },
      },
    });
  });

  it("falls back to calm copy when a failed response isn't JSON", async () => {
    stub(new Response("Bad gateway", { status: 502 }));
    await expect(sendGuideTurn(request, () => {})).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL", message: guideCopy.routes.unavailable },
    });
  });

  it("rejects a stream that ends before the reply, so the caller shows the slow note", async () => {
    const status = { type: "status", text: guideCopy.status.get_jars };
    stub(streamed([new TextEncoder().encode(`${JSON.stringify(status)}\n`)]));
    await expect(sendGuideTurn(request, () => {})).rejects.toThrow();
  });
});
