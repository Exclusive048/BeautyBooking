import type { MetadataRoute } from "next";
import { resolvePublicAppUrl } from "@/lib/app-url";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = resolvePublicAppUrl();
  const sitemap = baseUrl ? `${baseUrl}/sitemap.xml` : "/sitemap.xml";

  if (process.env.NODE_ENV !== "production") {
    return {
      rules: [{ userAgent: "*", disallow: ["/"] }],
      sitemap,
      host: baseUrl ?? undefined,
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/u/", "/c/"],
        disallow: ["/api/", "/admin/", "/cabinet/", "/auth/", "/login", "/logout", "/notifications"],
      },
    ],
    sitemap,
    host: baseUrl ?? undefined,
  };
}
