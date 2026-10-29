import { describe, expect, it } from "vitest";
import { toAppError } from "./db-error";

describe("toAppError", () => {
  it.each([
    ["JA401", "UNAUTHORIZED"],
    ["JA403", "FORBIDDEN"],
    ["JA404", "NOT_FOUND"],
    ["JA409", "CONFLICT"],
    ["JA423", "RATE_LIMITED"],
    ["JA429", "RATE_LIMITED"],
    ["22023", "VALIDATION"],
  ])("maps %s to %s and keeps cause", (sqlstate, code) => {
    const error = { code: sqlstate, message: "raw" };
    const result = toAppError(error, "f");
    expect(result.code).toBe(code);
    expect(result.cause).toBe(error);
  });

  it("uses a friendly lockout message for JA423 without a fixed wait (locks escalate)", () => {
    expect(toAppError({ code: "JA423" }, "f").message).toBe(
      "Too many tries. Ask your parent or wait a little while.",
    );
  });

  it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
    "treats the inherited key %s as unknown",
    (code) => {
      const result = toAppError({ code, message: "raw" }, "f");
      expect(result.code).toBe("INTERNAL");
      expect(result.message).toBe("f");
    },
  );

  it("falls back to INTERNAL for unknown codes and null", () => {
    const unknown = toAppError({ code: "XX000", message: "boom" }, "f");
    expect(unknown.code).toBe("INTERNAL");
    expect(unknown.message).toBe("f");
    expect(toAppError(null, "f").code).toBe("INTERNAL");
  });
});
