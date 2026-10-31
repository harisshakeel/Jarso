import { describe, expect, it } from "vitest";
import { protectedRoutePrefixes } from "@/config";
import robots from "./robots";
import sitemap from "./sitemap";

describe("sitemap", () => {
  it("lists only the public pages, as absolute URLs on the app's origin", () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toEqual([
      "http://localhost:3000/",
      "http://localhost:3000/safety",
      "http://localhost:3000/privacy",
    ]);
  });
});

describe("robots", () => {
  it("keeps crawlers out of every signed-in area and points at the sitemap", () => {
    const { rules, sitemap: map } = robots();
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect(rule?.disallow).toEqual(expect.arrayContaining([...protectedRoutePrefixes, "/api/"]));
    expect(map).toBe("http://localhost:3000/sitemap.xml");
  });
});
