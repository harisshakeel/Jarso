import { BADGE_KEYS, BADGES } from "@jarso/core/progress";
import { describe, expect, it } from "vitest";

describe("badges", () => {
  it("has 23 db-safe keys", () => {
    expect(BADGE_KEYS).toHaveLength(23);
    for (const k of BADGE_KEYS) expect(k).toMatch(/^[a-z0-9_]{1,40}$/);
  });
  it("describes each badge briefly", () => {
    for (const k of BADGE_KEYS) {
      const b = BADGES[k];
      expect(b.name.split(/\s+/).length).toBeLessThanOrEqual(3);
      expect(b.how.split(/\s+/).length).toBeLessThanOrEqual(8);
      expect(b.icon).toMatch(/^[a-z0-9-]+$/);
      expect(`${b.name} ${b.how}`).not.toMatch(/lost|broke|fail/i);
    }
  });
});
