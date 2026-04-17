import type { MetadataRoute } from "next";
import { resolvePublicAppUrl } from "@/lib/app-url";

const FALLBACK_BASE_URL = "https://мастеррядом.online";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = resolvePublicAppUrl() ?? FALLBACK_BASE_URL;
  const sitemap = `${baseUrl}/sitemap.xml`;

  if (process.env.NODE_ENV !== "production") {
    return {
      rules: [{ userAgent: "*", disallow: ["/"] }],
      sitemap,
      host: baseUrl,
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/u/", "/c/"],
        disallow: [
          "/api/",
          "/admin/",
          "/cabinet/",
          "/auth/",
          "/login",
          "/logout",
          "/offline",
          "/403",
          "/notifications",
        ],
      },
    ],
    sitemap,
    host: baseUrl,
  };
}
