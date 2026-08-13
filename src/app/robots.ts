import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/format";

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/settings",
        "/inbox",
        "/notifications",
        "/welcome",
        "/blocked",
        "/requests",
        "/feedback",
        "/calendar",
        "/share",
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
