import {
  CHILD_CALLS_YOU,
  setupFlowCopy as copy,
  PARENT_STEPS,
  parentStepNumber,
} from "@jarso/core/setup";
import { describe, expect, it } from "vitest";

const words = (s: string) => s.trim().split(/\s+/).length;

describe("parent steps", () => {
  it("are the seven steps of the spec, numbered from 1", () => {
    expect(PARENT_STEPS).toEqual([
      "welcome",
      "how",
      "account",
      "child",
      "money",
      "freedom",
      "share",
    ]);
    expect(parentStepNumber("welcome")).toBe(1);
    expect(parentStepNumber("account")).toBe(3);
    expect(parentStepNumber("share")).toBe(7);
    expect(copy.stepLabel(3, 7)).toBe("Step 3 of 7");
  });

  it("offers the usual names a child calls a parent", () => {
    expect(CHILD_CALLS_YOU).toEqual(["Mum", "Dad", "Mama", "Papa"]);
  });
});

describe("setup copy", () => {
  it("headings stay within 6 words", () => {
    const headings = [
      copy.welcome.title,
      ...copy.how.cards.map((card) => card.title),
      copy.account.title,
      copy.verify.title,
      copy.about.title,
      copy.child.title,
      copy.money.title("Sam"),
      copy.freedom.title,
      copy.share.title("Sam"),
    ];
    for (const heading of headings) expect(words(heading)).toBeLessThanOrEqual(6);
  });

  it("buttons stay within 3 words", () => {
    const labels = [
      copy.welcome.parent,
      copy.welcome.child,
      copy.next,
      copy.skip,
      copy.back,
      copy.account.submit,
      copy.verify.submit,
      copy.verify.resend,
      copy.about.other,
      copy.child.submit("Sam"),
      copy.child.later,
      copy.money.notNow,
      copy.freedom.submit,
      copy.share.send,
      copy.share.done,
    ];
    for (const label of labels) expect(words(label)).toBeLessThanOrEqual(3);
  });

  it("says the data promise on the child step", () => {
    expect(copy.child.promiseTitle).toBe("Only a nickname");
    expect(copy.child.promise).toBe("No email, surname or birthday.");
  });

  it("names the presets as the mockup does", () => {
    expect(copy.freedom.options.ask.label).toBe("Ask me every time");
    expect(copy.freedom.options.small.label).toBe("Small ones: just tell me");
    expect(copy.freedom.options.small.hint("₹50")).toBe("Under ₹50 goes through");
    expect(copy.freedom.options.free.label("Sam")).toBe("Sam decides");
    expect(copy.freedom.question("Sam")).toBe("When Sam saves or uses savings");
  });

  it("never shows a PIN on the share card, only that it was picked", () => {
    expect(copy.share.pin).toBe("PIN");
    expect(copy.share.pinValue).toBe("The one you picked");
    const message = copy.share.message({
      familyCode: "KQ74MX",
      nickname: "Sam",
      link: "jarso://x",
    });
    expect(message).not.toMatch(/\d{4}/);
  });

  it("the share message gives the code, nickname and the link", () => {
    const message = copy.share.message({
      familyCode: "KQ74MX",
      nickname: "Sam",
      link: "jarso://sign-in?code=KQ74MX&nickname=Sam",
    });
    expect(message).toContain("KQ74MX");
    expect(message).toContain("Sam");
    expect(message).toContain("jarso://sign-in?code=KQ74MX&nickname=Sam");
  });

  it("the code screen names the address it wrote to", () => {
    expect(copy.verify.sent("a@b.co")).toBe("We sent a code to a@b.co.");
    expect(copy.verify.wait(42)).toBe("Send again in 42 s");
  });

  it("never blames or alarms", () => {
    const all = JSON.stringify(copy);
    expect(all).not.toMatch(/\b(fail|failed|wrong|error|invalid)\b/i);
  });
});
