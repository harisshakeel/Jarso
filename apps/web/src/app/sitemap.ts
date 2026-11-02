import type { MetadataRoute } from "next";
import { clientEnv, publicPages } from "@/config";

/** The public pages. Signed-in pages are never listed; sign-in pages are `noindex`. */
export default function sitemap(): MetadataRoute.Sitemap {
  return publicPages.map((page) => ({
    url: new URL(page.path, clientEnv.NEXT_PUBLIC_APP_URL).href,
    lastModified: page.updated,
    changeFrequency: "monthly",
    priority: page.priority,
  }));
}
