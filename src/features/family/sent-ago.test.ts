import { describe, expect, it } from "vitest";
import { sentAgo } from "./sent-ago";

const now = Date.parse("2026-10-29T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("sentAgo", () => {
  it("says just now for under a minute, and for clock skew into the future", () => {
    expect(sentAgo(ago(30_000), now)).toBe("Sent just now");
    expect(sentAgo(ago(-5_000), now)).toBe("Sent just now");
  });

  it("uses minutes, then hours, then days", () => {
    expect(sentAgo(ago(60_000), now)).toBe("Sent 1 minute ago");
    expect(sentAgo(ago(59 * 60_000), now)).toBe("Sent 59 minutes ago");
    expect(sentAgo(ago(3 * 3_600_000), now)).toBe("Sent 3 hours ago");
    expect(sentAgo(ago(25 * 3_600_000), now)).toBe("Sent yesterday");
    expect(sentAgo(ago(6 * 86_400_000), now)).toBe("Sent 6 days ago");
  });
});
