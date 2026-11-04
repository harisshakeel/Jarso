import { noteCopy } from "@jarso/core/notifications";
import { describe, expect, it } from "vitest";

describe("noteCopy", () => {
  it("keeps every line", () => {
    expect(noteCopy).toMatchSnapshot();
  });

  it("fills in the nickname and the count as the web did", () => {
    expect(noteCopy.body("Ada")).toBe("It shows in Ada's Notifications. Keep it short and kind.");
    expect(noteCopy.count(12, 140)).toBe("12 of 140 characters");
  });
});
