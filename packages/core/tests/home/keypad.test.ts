import { parseMoney } from "@jarso/core/lib";
import { describe, expect, it } from "vitest";
import { KEYPAD_KEYS, type KeypadKey, pressKey, quickChips } from "../../src/home";

const type = (keys: KeypadKey[], currency = "INR") =>
  keys.reduce((v, k) => pressKey(v, k, currency), "");

describe("pressKey", () => {
  it("builds 45 from 4 then 5", () => expect(type(["4", "5"])).toBe("45"));
  it("replaces a leading zero", () => expect(type(["0", "5"])).toBe("5"));
  it("refuses a second dot", () => expect(type(["1", ".", "2", "."])).toBe("1.2"));
  it("stops at two decimals in INR", () => expect(type(["1", ".", "2", "5", "9"])).toBe("1.25"));
  it("refuses a dot in JPY", () => expect(type(["1", ".", "2"], "JPY")).toBe("12"));
  it("dot on empty gives 0.", () => expect(type(["."])).toBe("0."));
  it("back on empty stays empty", () => expect(pressKey("", "back", "INR")).toBe(""));
  it("back drops the last char", () => expect(type(["1", "2", "back"])).toBe("1"));
  it("caps whole digits at 6", () =>
    expect(type(["1", "2", "3", "4", "5", "6", "7"])).toBe("123456"));

  it("every result parses", () => {
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let run = 0; run < 200; run++) {
      let v = "";
      for (let i = 0; i < 12; i++) {
        v = pressKey(v, KEYPAD_KEYS[Math.floor(rand() * KEYPAD_KEYS.length)] as KeypadKey, "INR");
        if (v !== "" && !v.endsWith(".")) expect(parseMoney(v, "INR")).not.toBeNull();
      }
    }
  });
});

describe("quickChips", () => {
  it("INR chips are 10 20 50 100 in minor units", () =>
    expect(quickChips("INR")).toEqual([1000, 2000, 5000, 10000]));
  it("GBP chips are 1 2 5 10", () => expect(quickChips("GBP")).toEqual([100, 200, 500, 1000]));
  it("JPY chips have no minor digits", () =>
    expect(quickChips("JPY")).toEqual([100, 500, 1000, 5000]));
  it("drops chips above the limit", () => expect(quickChips("INR", 3000)).toEqual([1000, 2000]));
});
