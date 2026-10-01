import type { MetadataRoute } from "next";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { isProduction } from "@/lib/env";

const FALLBACK_BASE_URL = "https://masterryadom.ru";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = resolvePublicAppUrl() ?? FALLBACK_BASE_URL;
  const sitemap = `${baseUrl}/sitemap.xml`;

  if (!isProduction) {
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
        // SEO-01: `/api/og/` — картинка превью профиля для выдачи и соцсетей;
        // более длинное правило побеждает `disallow: /api/`. Страницы `/c/`
        // закрыты `noindex`, поэтому из `allow` убраны.
        allow: ["/", "/u/", "/api/og/"],
        disallow: [
          "/api/",
          "/booking/manage/",
          "/clients/",
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
