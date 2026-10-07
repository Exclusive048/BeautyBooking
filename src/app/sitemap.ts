import type { MetadataRoute } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { catalogVisibleProviderWhere, SELLS_OWN_SERVICES_WHERE } from "@/lib/providers/catalog-visibility";
import { resolvePublicAppUrl } from "@/lib/app-url";
import { logError } from "@/lib/logging/logger";

const FALLBACK_BASE_URL = "https://masterryadom.ru";
const PAGE_SIZE = 1000;

// SEO-SITEMAP-01: без этого Next кэширует sitemap на `next build`, где база —
// заглушка Dockerfile (`127.0.0.1:5432/build`): запрос падает, `catch` отдаёт
// только статические страницы, и такой файл раздаётся до следующего деплоя —
// на проде в sitemap не было ни одной страницы мастера или студии.
export const dynamic = "force-dynamic";

function buildStaticRoutes(baseUrl: string): MetadataRoute.Sitemap {
  return [
    { url: `${baseUrl}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/catalog`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/models`, changeFrequency: "daily", priority: 0.7 },
    { url: `${baseUrl}/pricing`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/become-master`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/how-it-works`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/how-to-book`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/faq`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/help`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/partners`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/support`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${baseUrl}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/consent`, changeFrequency: "yearly", priority: 0.2 },
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = resolvePublicAppUrl() ?? FALLBACK_BASE_URL;
  const staticRoutes = buildStaticRoutes(baseUrl);
  const dynamicRoutes: MetadataRoute.Sitemap = [];

  // SEO-SITEMAP-02: профили — ровно те, что показывает каталог (видимость +
  // город + расписание + свои услуги). Включённой видимости мало: она стоит с
  // рождения кабинета, и в sitemap попадали пустые страницы без услуг и
  // расписания — Google их сканирует и не индексирует.
  const where: Prisma.ProviderWhereInput = {
    AND: [catalogVisibleProviderWhere(), SELLS_OWN_SERVICES_WHERE, { publicUsername: { not: null } }],
  };

  try {
    let cursor: string | null = null;

    while (true) {
      const rows: Array<{ id: string; publicUsername: string | null }> =
        await prisma.provider.findMany({
          where,
          select: { id: true, publicUsername: true },
          orderBy: { id: "asc" },
          take: PAGE_SIZE + 1,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });

      if (rows.length === 0) break;

      const page = rows.slice(0, PAGE_SIZE);
      for (const row of page) {
        if (!row.publicUsername) continue;
        // SEO-SITEMAP-02: `lastModified` намеренно нет. `Provider.updatedAt`
        // сдвигает воркер каждые 30 минут (пересчёт «свободно сегодня» и
        // снимка свободного времени), то есть дата менялась без изменения
        // страницы — и Google, заметив это, перестаёт доверять lastmod сайта.
        dynamicRoutes.push({
          url: `${baseUrl}/u/${row.publicUsername}`,
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
