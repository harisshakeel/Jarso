import { describe, expect, it } from "vitest";
import { uuid } from "./uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuid", () => {
  it("falls back to getRandomValues outside a secure context", () => {
    // Shadow the prototype method on the instance; deleting the shadow restores it.
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      const a = uuid();
      expect(a).toMatch(V4);
      expect(uuid()).not.toBe(a);
    } finally {
      Reflect.deleteProperty(crypto, "randomUUID");
    }
  });

  it("uses randomUUID when present", () => {
    expect(uuid()).toMatch(V4);
  });
});
