import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { logError } from "@/lib/logging/logger";

const FALLBACK_BASE_URL = "https://мастеррядом.online";
const PAGE_SIZE = 1000;

function buildStaticRoutes(baseUrl: string): MetadataRoute.Sitemap {
  return [
    { url: `${baseUrl}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/catalog`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/hot`, changeFrequency: "daily", priority: 0.7 },
    { url: `${baseUrl}/models`, changeFrequency: "daily", priority: 0.7 },
    { url: `${baseUrl}/pricing`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/become-master`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/how-it-works`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/how-to-book`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/faq`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/support`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = resolvePublicAppUrl() ?? FALLBACK_BASE_URL;
  const staticRoutes = buildStaticRoutes(baseUrl);
  const dynamicRoutes: MetadataRoute.Sitemap = [];

  try {
    let cursor: string | null = null;

    while (true) {
      const rows: Array<{ id: string; publicUsername: string | null; updatedAt: Date }> =
        await prisma.provider.findMany({
          where: { isPublished: true, publicUsername: { not: null } },
          select: { id: true, publicUsername: true, updatedAt: true },
          orderBy: { id: "asc" },
          take: PAGE_SIZE + 1,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });

      if (rows.length === 0) break;

      const page = rows.slice(0, PAGE_SIZE);
      for (const row of page) {
        if (!row.publicUsername) continue;
        dynamicRoutes.push({
          url: `${baseUrl}/u/${row.publicUsername}`,
          lastModified: row.updatedAt,
          changeFrequency: "weekly",
          priority: 0.8,
        });
      }

      if (rows.length <= PAGE_SIZE) break;
      cursor = page[page.length - 1]?.id ?? null;
    }
  } catch (error) {
    logError("Sitemap DB error", {
      error: error instanceof Error ? error.stack : String(error),
    });
    return staticRoutes;
  }

  return [...staticRoutes, ...dynamicRoutes];
}
