import type { MetadataRoute } from "next";
import { siteConfig } from "@/config";

/** App install (FR16): the web app manifest. Colours follow design.md §2.3. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F5F0",
    theme_color: "#F7F5F0",
    categories: ["education", "finance", "kids"],
    icons: [
      { src: "/brand/icons/jarso-mark-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icons/jarso-mark-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
