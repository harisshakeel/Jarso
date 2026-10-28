import { describe, expect, it } from "vitest";
import { AppError, isAppError } from "./errors";

describe("AppError", () => {
  it("maps code to HTTP status", () => {
    expect(new AppError("NOT_FOUND", "x").status).toBe(404);
    expect(new AppError("UNAUTHORIZED", "x").status).toBe(401);
  });

  it("is detected by isAppError", () => {
    expect(isAppError(new AppError("INTERNAL", "x"))).toBe(true);
    expect(isAppError(new Error("x"))).toBe(false);
  });
});
