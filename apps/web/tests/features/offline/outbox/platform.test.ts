import { afterEach, describe, expect, it, vi } from "vitest";
import { webOutboxPlatform } from "@/features/offline/outbox/platform";
import { installLocks } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("webOutboxPlatform", () => {
  it("withLock skips with null, never waits, while another tab holds the Web Lock", async () => {
    const uninstall = installLocks();
    try {
      let release: () => void = () => {};
      const held = webOutboxPlatform.withLock(
        "jarso-outbox:u",
        () =>
          new Promise<string>((resolve) => {
            release = () => resolve("first");
          }),
      );
      const fn = vi.fn(async () => "second");
      expect(await webOutboxPlatform.withLock("jarso-outbox:u", fn)).toBeNull();
      expect(fn).not.toHaveBeenCalled();
      release();
      expect(await held).toBe("first");
      expect(await webOutboxPlatform.withLock("jarso-outbox:u", fn)).toBe("second");
    } finally {
      uninstall();
    }
  });

  it("withLock runs fn directly when Web Locks are missing", async () => {
    expect("locks" in navigator).toBe(false);
    expect(await webOutboxPlatform.withLock("jarso-outbox:u", async () => 7)).toBe(7);
  });

  it("openStore resolves null when opening IndexedDB throws", async () => {
    vi.resetModules();
    vi.stubGlobal("indexedDB", {
      open() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    const fresh = await import("@/features/offline/outbox/platform");
    expect(await fresh.webOutboxPlatform.openStore()).toBeNull();
  });
});
