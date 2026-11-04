import { chatWhen, jarsoNoticeCopy, parentGuideCopy } from "@jarso/core/guide";
import { describe, expect, it } from "vitest";

describe("parentGuideCopy", () => {
  it("keeps every line", () => {
    expect(parentGuideCopy).toMatchSnapshot();
  });

  it("keeps the Jarso notice told before a child is added", () => {
    expect(jarsoNoticeCopy).toMatchSnapshot();
  });

  it("counts chats and questions as the web did", () => {
    expect(parentGuideCopy.flagged(1)).toBe("1 chat is worth a look.");
    expect(parentGuideCopy.flagged(3)).toBe("3 chats are worth a look.");
    expect(parentGuideCopy.questions(1)).toBe("1 question");
    expect(parentGuideCopy.questions(2)).toBe("2 questions");
    expect(parentGuideCopy.lookedAt(["jars", "goal"])).toBe("Looked at: jars, goal");
  });
});

describe("chatWhen", () => {
  it("shows the time in the family's timezone", () => {
    expect(chatWhen("2026-11-01T23:30:00Z", "Asia/Kolkata")).toBe("2 Nov, 05:00");
  });
});
