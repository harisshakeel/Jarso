import { afterEach, describe, expect, it, vi } from "vitest";
import { configureLogger, logger } from "../../src/lib/logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("drops info below a warn level", () => {
    configureLogger({ level: "warn" });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.info("x");
    expect(info).not.toHaveBeenCalled();
    logger.warn("y");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("writes one JSON string in json mode", () => {
    configureLogger({ level: "info", json: true });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.info("hi", { a: 1 });
    expect(info).toHaveBeenCalledTimes(1);
    const args = info.mock.calls[0] ?? [];
    expect(args).toHaveLength(1);
    expect(JSON.parse(String(args[0]))).toMatchObject({ level: "info", message: "hi", a: 1 });
  });

  it("defaults to info and readable output", async () => {
    vi.resetModules();
    const fresh = await import("../../src/lib/logger");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    fresh.logger.debug("d");
    expect(log).not.toHaveBeenCalled();
    fresh.logger.info("m");
    expect(info).toHaveBeenCalledWith("[info] m", "");
  });
});
