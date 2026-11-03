import {
  DEFAULT_NAME_HINT,
  earlierVersions,
  entrySavedMessage,
  fixRefusalMessage,
  NAME_HINTS,
  notEnoughSpendMessage,
  notEnoughSpendToLowerMessage,
  notEnoughSpendToRaiseMessage,
  undoneReceivedMessage,
  undoneSpendMessage,
} from "@jarso/core/diary";
import { describe, expect, it } from "vitest";

describe("notEnoughSpendMessage", () => {
  it("says the jar is empty when nothing is free", () => {
    expect(notEnoughSpendMessage(0, "GBP")).toBe(
      "Your Spend jar is empty right now. Record money you got first, or ask a parent.",
    );
  });

  it("names what is left otherwise", () => {
    expect(notEnoughSpendMessage(300, "GBP")).toBe(
      "That's more than you have in Spend (£3). Record money you got first, or ask a parent.",
    );
  });
});

describe("fix refusals", () => {
  it("names the most a purchase can be", () => {
    expect(notEnoughSpendToRaiseMessage(350, 100, "GBP")).toBe(
      "That's more than you have in Spend. The most it can be is £4.50.",
    );
  });

  it("names the least money received can be, never below zero", () => {
    expect(notEnoughSpendToLowerMessage(2000, 500, "GBP")).toBe(
      "You've spent some of this already. The least it can be is £15.",
    );
    expect(notEnoughSpendToLowerMessage(200, 500, "GBP")).toBe(
      "You've spent some of this already. The least it can be is £0.",
    );
  });
});

describe("saved, undone and name-hint copy", () => {
  it("keeps the exact lines the web and the phone show", () => {
    expect(entrySavedMessage).toBe("Saved. Nice one.");
    expect(undoneSpendMessage).toBe("Undone. The money is back in Spend.");
    expect(undoneReceivedMessage).toBe("Undone. It's out of your jar.");
    expect(DEFAULT_NAME_HINT).toBe("What was it?");
    expect(NAME_HINTS).toEqual({
      snacks: "What snack?",
      games: "What game?",
      clothes: "What clothes?",
      going_out: "Where did you go?",
      gift_for_someone: "What gift?",
      school: "What for school?",
      travel: "Where to?",
      apps: "Which app?",
    });
  });
});

describe("fixRefusalMessage", () => {
  it("is null once fixed", () => {
    expect(fixRefusalMessage({ status: "fixed", entryId: "e" }, "purchase", "GBP", 500)).toBeNull();
  });

  it("names each refusal", () => {
    expect(fixRefusalMessage({ status: "unchanged" }, "purchase", "GBP", 500)).toBe(
      "Nothing changed.",
    );
    expect(fixRefusalMessage({ status: "not_fixable" }, "purchase", "GBP", 500)).toBe(
      "This one can't be fixed any more.",
    );
    expect(fixRefusalMessage({ status: "not_enough_save" }, "received", "GBP", 500)).toBe(
      "Some of your Save is waiting to come out, so this can't be lowered right now.",
    );
  });

  it("gives the limit when Spend is short", () => {
    const short = { status: "not_enough_spend", freeMinor: 200 } as const;
    expect(fixRefusalMessage(short, "purchase", "GBP", 500)).toBe(
      "That's more than you have in Spend. The most it can be is £7.",
    );
    expect(fixRefusalMessage(short, "received", "GBP", 500)).toBe(
      "You've spent some of this already. The least it can be is £3.",
    );
  });
});

describe("earlierVersions", () => {
  const v = (id: string) => ({ id, amountMinor: 1, category: null, label: "", createdAt: "t" });

  it("drops the current line and puts the newest first", () => {
    expect(earlierVersions([v("a"), v("b"), v("c")], "c").map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("pending and diary page copy", () => {
  it("keeps the web's words", async () => {
    const { diaryCopy, pendingCopy } = await import("@jarso/core/diary");
    expect(pendingCopy.heading).toBe("Not sent yet");
    expect(pendingCopy.changeFor("Crisps")).toBe("Change it: Crisps");
    expect(pendingCopy.askAParentFor("Crisps")).toBe("Ask a parent: Crisps");
    expect(pendingCopy.removeFor("Crisps")).toBe("Remove: Crisps");
    expect(pendingCopy.askAParentNote).toBe("Show this to a parent and decide together.");
    expect(`${diaryCopy.youHave} £5 ${diaryCopy.inSpend}`).toBe("You have £5 in Spend.");
  });
});
