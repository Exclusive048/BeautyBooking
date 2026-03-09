import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { logError } from "@/lib/logging/logger";

const PAGE_SIZE = 1000;

function buildStaticRoutes(baseUrl: string): MetadataRoute.Sitemap {
  return [
    {
      url: `${baseUrl}/`,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/catalog`,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/hot`,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/models`,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/terms`,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/privacy`,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = resolvePublicAppUrl() ?? "http://localhost:3000";
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
          priority: 0.7,
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
