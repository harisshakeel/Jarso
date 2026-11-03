import { describe, expect, it } from "vitest";
import { chatDay, chatTitle, guideUi } from "../../src/guide";
import { inboxCopy } from "../../src/notifications";

describe("guide ui copy", () => {
  it("keeps the thread's lines", () => {
    expect(guideUi.lookedAt("jars, allowance")).toBe("Looked at: jars, allowance");
    expect(`${guideUi.count(12, 280)}${guideUi.turnsLeft(2)}`).toBe("12/280 · 2 left in this chat");
    expect(guideUi.quickCheck("Which is more?")).toBe("Quick check: Which is more?");
  });

  it("titles a chat by its first message", () => {
    expect(chatTitle({ preview: "  How much do I have? ", label: "Home" })).toBe(
      "How much do I have?",
    );
    expect(chatTitle({ preview: "", label: "Home" })).toBe("Home");
    expect(chatTitle({ preview: "x".repeat(60), label: "Home" })).toBe(`${"x".repeat(47)}…`);
    expect(chatDay("2026-11-02T23:30:00Z", "Asia/Kolkata")).toBe("Tue 3 Nov");
  });

  it("keeps the inbox's lines", () => {
    expect(inboxCopy.markAll).toBe("Mark all as read");
    expect(inboxCopy.unread).toBe(" (new)");
  });
});
