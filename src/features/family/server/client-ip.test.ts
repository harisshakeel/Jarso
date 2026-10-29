import { beforeEach, describe, expect, it, vi } from "vitest";

let current = new Headers();
vi.mock("next/headers", () => ({ headers: vi.fn(async () => current) }));

const { getClientIp } = await import("./client-ip");

describe("getClientIp", () => {
  beforeEach(() => {
    current = new Headers();
  });

  it("uses the first x-forwarded-for hop", async () => {
    current.set("x-forwarded-for", " 203.0.113.7 , 10.0.0.1");
    current.set("x-real-ip", "198.51.100.2");
    await expect(getClientIp()).resolves.toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", async () => {
    current.set("x-real-ip", "198.51.100.2");
    await expect(getClientIp()).resolves.toBe("198.51.100.2");
  });

  it("falls back to x-real-ip when x-forwarded-for is blank", async () => {
    current.set("x-forwarded-for", " ");
    current.set("x-real-ip", "198.51.100.2");
    await expect(getClientIp()).resolves.toBe("198.51.100.2");
  });

  it("returns unknown without either header", async () => {
    await expect(getClientIp()).resolves.toBe("unknown");
  });
});
