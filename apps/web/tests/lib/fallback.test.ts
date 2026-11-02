import { describe, expect, it, vi } from "vitest";
import { fallback } from "@/lib/fallback";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

describe("fallback", () => {
  it("passes a value through", async () => {
    await expect(fallback(Promise.resolve(3), 0, "x")).resolves.toBe(3);
  });

  it("gives the fallback and logs when the read fails", async () => {
    const { logger } = await import("@/lib/logger");
    await expect(fallback(Promise.reject(new TypeError("boom")), [], "Goal")).resolves.toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith("Goal unavailable", { error: "TypeError" });
  });
});
