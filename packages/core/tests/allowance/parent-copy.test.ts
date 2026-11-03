import {
  allowanceFormCopy,
  allowanceSummaryCopy,
  dueKindLabel,
  dueListCopy,
  giftCopy,
  handoverCopy,
  needsYouCopy,
  pauseCopy,
} from "@jarso/core/allowance";
import { describe, expect, it } from "vitest";

// Parent allowance copy, moved word for word from the web components.

describe("parent allowance copy", () => {
  it("keeps every line", () => {
    expect({
      needsYouCopy,
      dueListCopy,
      handoverCopy,
      giftCopy,
      allowanceFormCopy,
      allowanceSummaryCopy,
      pauseCopy,
    }).toMatchSnapshot();
  });

  it("fills in names, days and amounts as the web did", () => {
    expect(dueKindLabel("gift")).toBe("Gift");
    expect(dueKindLabel("allowance")).toBe("Allowance");
    expect(needsYouCopy.handOverLabel("gift", "Ada", "1 Nov")).toBe(
      "Hand over gift to Ada, due 1 Nov",
    );
    expect(handoverCopy.heading("allowance", "1 Nov")).toBe("Allowance · Due 1 Nov");
    expect(handoverCopy.over("£5.00")).toBe("That's more than £5.00, which was due.");
    expect(handoverCopy.shortLine("Ada", "£4.00", "£1.00")).toBe(
      "Ada gets £4.00 this time, £1.00 less than was due.",
    );
    expect(handoverCopy.notGivenBody("Ada")).toBe(
      "Ada won't get this one, and it won't be paid later.",
    );
    expect(allowanceSummaryCopy.pausedUntil("1 Nov", "8 Nov")).toBe(
      "Paused until 1 Nov. Next one: 8 Nov.",
    );
    expect(allowanceSummaryCopy.pausedUntil("1 Nov", null)).toBe("Paused until 1 Nov.");
    expect(allowanceSummaryCopy.stopTitle("Ada")).toBe("Stop Ada's allowance?");
    expect(pauseCopy.title("Ada")).toBe("Pause Ada's allowance");
    expect(giftCopy.noteLabel("Ada")).toBe("Note for Ada (optional)");
  });
});
