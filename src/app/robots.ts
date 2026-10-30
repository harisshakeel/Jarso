import type { MetadataRoute } from "next";
import { clientEnv, protectedRoutePrefixes } from "@/config";

/**
 * Crawlers may read the public pages; signed-in areas, the API and auth callbacks are off limits.
 * Sign-in pages stay crawlable so crawlers can see their `noindex`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...protectedRoutePrefixes, "/api/", "/auth/"],
    },
    sitemap: new URL("/sitemap.xml", clientEnv.NEXT_PUBLIC_APP_URL).href,
  };
}
