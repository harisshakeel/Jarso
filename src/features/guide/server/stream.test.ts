// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib";

vi.mock("./service", () => ({ runGuideTurn: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const service = await import("./service");
const { logger } = await import("@/lib/logger");
const { guideCopy } = await import("../copy");
const { streamGuideTurn } = await import("./stream");

const result = {
  conversationId: "convo-1",
  turnsLeft: 11,
  reply: {
    messageId: "reply-1",
    role: "guide" as const,
    text: "You have £12.40 in Spend.",
    route: "on_topic" as const,
    topics: [],
    check: null,
    helplines: [],
    lookedAt: ["jars"],
  },
};

const ready = { kind: "ready" } as unknown as Parameters<typeof streamGuideTurn>[0];

async function lines(response: Response): Promise<unknown[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

beforeEach(() => vi.clearAllMocks());

describe("streamGuideTurn", () => {
  it("streams a status line per look-up, then the reply, as NDJSON", async () => {
    vi.mocked(service.runGuideTurn).mockImplementation(async (_turn, options) => {
      options?.onStatus?.(guideCopy.status.get_jars);
      options?.onStatus?.(guideCopy.status.plan_saving);
      return result;
    });
    const response = streamGuideTurn(ready);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await lines(response)).toEqual([
      { type: "status", text: guideCopy.status.get_jars },
      { type: "status", text: guideCopy.status.plan_saving },
      { type: "reply", data: result },
    ]);
  });

  it("answers a re-sent question with the stored reply, without running the turn", async () => {
    expect(await lines(streamGuideTurn({ kind: "stored", result }))).toEqual([
      { type: "reply", data: result },
    ]);
    expect(service.runGuideTurn).not.toHaveBeenCalled();
  });

  it("sends an AppError's safe message", async () => {
    vi.mocked(service.runGuideTurn).mockRejectedValue(new AppError("CONFLICT", guideCopy.chatFull));
    expect(await lines(streamGuideTurn(ready))).toEqual([
      { type: "error", error: { code: "CONFLICT", message: guideCopy.chatFull } },
    ]);
  });

  it("turns anything else into calm copy, logging the class name only", async () => {
    vi.mocked(service.runGuideTurn).mockRejectedValue(new TypeError("row text from the database"));
    expect(await lines(streamGuideTurn(ready))).toEqual([
      { type: "error", error: { code: "INTERNAL", message: guideCopy.routes.unavailable } },
    ]);
    expect(logger.error).toHaveBeenCalledWith("Guide turn failed", { error: "TypeError" });
  });

  it("keeps running the turn when the page goes away mid-stream", async () => {
    let statusThrew = false;
    vi.mocked(service.runGuideTurn).mockImplementation(async (_turn, options) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      try {
        options?.onStatus?.(guideCopy.status.get_jars);
      } catch {
        statusThrew = true;
      }
      return result;
    });
    const response = streamGuideTurn(ready);
    await response.body?.cancel();
    await vi.waitFor(() => expect(service.runGuideTurn).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(statusThrew).toBe(false);
  });
});
