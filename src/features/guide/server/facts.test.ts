import { describe, expect, it } from "vitest";
import { addFact, describeFacts, type Facts, fillFacts } from "./facts";

function facts(): Facts {
  const map: Facts = new Map();
  addFact(map, "jars.save", "£30");
  addFact(map, "plan.allowances", "7");
  return map;
}

describe("fillFacts", () => {
  it("replaces each ref with the looked-up figure, spaces inside the braces allowed", () => {
    expect(fillFacts("You have {{jars.save}}. About {{ plan.allowances }} more.", facts())).toEqual(
      {
        text: "You have £30. About 7 more.",
        unknown: [],
      },
    );
  });

  it("reports a ref that was never looked up", () => {
    expect(fillFacts("You need {{plan.still_needed}}.", facts()).unknown).toEqual([
      "plan.still_needed",
    ]);
  });

  it("reports leftovers that look like refs but aren't", () => {
    for (const text of ["You have {jars.save}.", "You have {{jars.save}.", "Odd }} braces"]) {
      expect(fillFacts(text, facts()).unknown, text).not.toEqual([]);
    }
  });

  it("leaves text with no refs alone", () => {
    expect(fillFacts("Saving means keeping money for later.", facts())).toEqual({
      text: "Saving means keeping money for later.",
      unknown: [],
    });
  });
});

describe("addFact", () => {
  it("returns the ref and value the model sees", () => {
    expect(addFact(new Map(), "jars.spend", "£12.40")).toEqual({
      ref: "{{jars.spend}}",
      value: "£12.40",
    });
  });

  it("rejects a key that couldn't be written as a ref", () => {
    expect(() => addFact(new Map(), "Jars Spend", "£1")).toThrow();
  });

  it("never rebinds a ref to a different figure", () => {
    const map = facts();
    expect(() => addFact(map, "jars.save", "£30")).not.toThrow();
    expect(() => addFact(map, "jars.save", "£31")).toThrow();
    expect(map.get("jars.save")).toBe("£30");
  });
});

describe("describeFacts", () => {
  it("lists every figure for the output screen", () => {
    expect(describeFacts(facts())).toContain("- jars.save: £30\n- plan.allowances: 7");
    expect(describeFacts(new Map())).toBe("No figures were looked up for this reply.");
  });
});
