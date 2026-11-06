import { guideCopy, jarsoTabCopy } from "@jarso/core/guide";
import { describe, expect, it } from "vitest";

describe("jarsoTabCopy", () => {
  it("the notice names the parent, capitalised", () => {
    expect(jarsoTabCopy.notice("mum")).toBe("I'm an AI. Mum can see our chats.");
    expect(jarsoTabCopy.notice("your parent")).toBe("I'm an AI. Your parent can see our chats.");
  });

  it("starters are the shared guide questions", () => {
    const shared = Object.values(guideCopy.suggestions) as string[];
    expect(jarsoTabCopy.starters).toHaveLength(3);
    for (const starter of jarsoTabCopy.starters) expect(shared).toContain(starter.question);
  });
});
