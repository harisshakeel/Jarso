import { describe, expect, it } from "vitest";
import { threadMessagesFrom } from "@/features/guide/thread-messages";
import type { TranscriptMessage } from "@/features/guide/types";

const base = { flagged: false, createdAt: "2026-11-02T10:00:00Z", hidden: false, lookedAt: [] };

describe("threadMessagesFrom", () => {
  it("turns a stored chat into the thread's messages, keeping thumbs and look-ups", () => {
    const stored: TranscriptMessage[] = [
      { ...base, id: "m1", role: "child", text: "How much do I have?", route: null, rating: null },
      {
        ...base,
        id: "m2",
        role: "guide",
        text: "You have £12.40 in Spend.",
        route: "on_topic",
        rating: 1,
        lookedAt: ["jars"],
      },
    ];
    expect(threadMessagesFrom(stored, "GBP")).toEqual([
      { id: "m1", from: "child", text: "How much do I have?" },
      {
        id: "m2",
        from: "guide",
        reply: {
          messageId: "m2",
          rating: 1,
          role: "guide",
          text: "You have £12.40 in Spend.",
          route: "on_topic",
          topics: [],
          check: null,
          helplines: [],
          lookedAt: ["jars"],
          remembered: [],
        },
      },
    ]);
  });

  it("gives a safety reply its helplines and fixed copy no thumbs", () => {
    const stored: TranscriptMessage[] = [
      {
        ...base,
        id: "m1",
        role: "child",
        text: "This message wasn't kept.",
        route: null,
        rating: null,
        hidden: true,
      },
      {
        ...base,
        id: "m2",
        role: "fixed_copy",
        text: "Thank you for telling me.",
        route: "safety",
        rating: null,
      },
    ];
    const [, reply] = threadMessagesFrom(stored, "GBP");
    expect(reply?.from === "guide" && reply.reply.messageId).toBeNull();
    expect(reply?.from === "guide" && reply.reply.helplines.length).toBeGreaterThan(0);
  });
});
