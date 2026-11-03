import { parentRequestCopy, requestSentence } from "@jarso/core/requests";
import { describe, expect, it } from "vitest";

describe("parentRequestCopy", () => {
  it("keeps every line", () => {
    expect(parentRequestCopy).toMatchSnapshot();
  });
});

describe("requestSentence", () => {
  const amount = "£5.00";

  it("emergency asks for extra with the reason", () => {
    expect(
      requestSentence({ kind: "emergency", status: "pending", reason: "Bus fare" }, "Ada", amount),
    ).toBe("Ada asks for £5.00 extra: Bus fare");
  });

  it("plain take-out wants the amount, with the reason when given", () => {
    expect(
      requestSentence({ kind: "withdrawal", status: "pending", reason: "Comic" }, "Ada", amount),
    ).toBe("Ada wants £5.00: Comic");
    expect(
      requestSentence({ kind: "withdrawal", status: "pending", reason: null }, "Ada", amount),
    ).toBe("Ada wants £5.00");
  });

  it("approved ones are handed over, extra or not", () => {
    expect(
      requestSentence({ kind: "emergency", status: "approved", reason: "Bus" }, "Ada", amount),
    ).toBe("Hand over £5.00 extra to Ada");
    expect(
      requestSentence({ kind: "withdrawal", status: "approved", reason: null }, "Ada", amount),
    ).toBe("Hand over £5.00 to Ada");
  });

  it("a put-in asks the parent to confirm the cash", () => {
    expect(
      requestSentence({ kind: "deposit", status: "pending", reason: null }, "Ada", amount),
    ).toBe("Ada gave you £5.00?");
  });
});
