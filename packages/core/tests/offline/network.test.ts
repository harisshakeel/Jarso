import { isNetworkFailure } from "@jarso/core/offline";
import { describe, expect, it } from "vitest";

describe("isNetworkFailure", () => {
  it.each([
    ["Chrome", new TypeError("Failed to fetch")],
    ["Firefox", new TypeError("NetworkError when attempting to fetch resource.")],
    ["Safari", new TypeError("Load failed")],
    ["Node", new TypeError("fetch failed")],
  ])("matches %s's fetch TypeError", (_engine, error) => {
    expect(isNetworkFailure(error)).toBe(true);
  });

  it("matches expo/fetch's FetchError", () => {
    const error = Object.assign(new Error("fetch failed: offline"), { name: "FetchError" });
    expect(isNetworkFailure(error)).toBe(true);
  });

  it("matches a plain Error whose message starts with fetch failed", () => {
    expect(isNetworkFailure(new Error("Fetch failed: the network connection was lost"))).toBe(true);
  });

  it.each([
    ["a plain Error", new Error("boom")],
    ["a TypeError from a bug", new TypeError("x is not a function")],
    ["a timeout", Object.assign(new Error("The operation timed out."), { name: "TimeoutError" })],
    ["a non-Error", "fetch failed"],
  ])("does not match %s", (_name, error) => {
    expect(isNetworkFailure(error)).toBe(false);
  });
});
