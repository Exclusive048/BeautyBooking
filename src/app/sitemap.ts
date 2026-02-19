import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { resolvePublicAppUrl } from "@/lib/app-url";

const PAGE_SIZE = 1000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = resolvePublicAppUrl() ?? "http://localhost:3000";
  const urls: MetadataRoute.Sitemap = [
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
  ];

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
      urls.push({
        url: `${baseUrl}/u/${row.publicUsername}`,
        lastModified: row.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    if (rows.length <= PAGE_SIZE) break;
    cursor = rows[PAGE_SIZE]?.id ?? null;
  }

  return urls;
}
