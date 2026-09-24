import { MediaAssetStatus, MediaEntityType, MediaKind, type PrismaClient } from "@prisma/client";
import { buildMediaFileUrl } from "@/lib/media/types";

/**
 * STUDIO-PORTFOLIO-FEED (2026-09-24) — ядро синхронизации «фото студии →
 * строка работы». Без `server-only`-зависимостей и с клиентом БД параметром:
 * его зовёт и рантайм (`portfolio-items.ts`), и пост-деплой (`tsx`), где
 * `@/lib/prisma` недоступен. Смысл и правило — в шапке `portfolio-items.ts`.
 */

/** Ключ `AppSetting` с id баннера студии — единственное место формата. */
export function studioBannerSettingKey(studioProviderId: string): string {
  return `studioBannerAssetId:${studioProviderId}`;
}

export type StudioPortfolioSyncResult = { created: number; removed: number };

export async function syncStudioPortfolioItemsWith(
  db: PrismaClient,
  studioProviderId: string,
): Promise<StudioPortfolioSyncResult> {
  const studio = await db.studio.findUnique({
    where: { providerId: studioProviderId },
    select: { id: true },
  });
  if (!studio) return { created: 0, removed: 0 };

  const [assets, bannerSetting, items] = await Promise.all([
    db.mediaAsset.findMany({
      where: {
        entityType: MediaEntityType.STUDIO,
        entityId: studioProviderId,
        kind: MediaKind.PORTFOLIO,
        deletedAt: null,
        status: MediaAssetStatus.READY,
      },
      select: { id: true, createdAt: true },
    }),
    db.appSetting.findUnique({
      where: { key: studioBannerSettingKey(studioProviderId) },
      select: { value: true },
    }),
    db.portfolioItem.findMany({
      where: { masterId: studioProviderId },
      select: { id: true, mediaUrl: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const bannerAssetId = bannerSetting?.value ?? null;
  const wanted = new Map(
    assets
      .filter((asset) => asset.id !== bannerAssetId)
      .map((asset) => [buildMediaFileUrl(asset.id), asset] as const),
  );

  // Лишние строки: фото удалено/стало баннером, либо дубль от гонки двух
  // синхронизаций (уникальности по ссылке в БД нет — оставляем первую).
  const seen = new Set<string>();
  const toRemove: string[] = [];
  for (const item of items) {
    if (!wanted.has(item.mediaUrl) || seen.has(item.mediaUrl)) {
      toRemove.push(item.id);
      continue;
    }
    seen.add(item.mediaUrl);
  }
  const toCreate = [...wanted.entries()].filter(([url]) => !seen.has(url));

  if (toRemove.length > 0) {
    await db.portfolioItem.deleteMany({ where: { id: { in: toRemove } } });
  }
  if (toCreate.length > 0) {
    await db.portfolioItem.createMany({
      data: toCreate.map(([mediaUrl, asset]) => ({
        masterId: studioProviderId,
        studioId: studio.id,
        mediaUrl,
        isPublic: true,
        // Дата работы = дата загрузки фото: свежие попадают в истории, а
        // досозданные пост-деплоем старые — только в ленту.
        createdAt: asset.createdAt,
      })),
    });
  }

  return { created: toCreate.length, removed: toRemove.length };
}

/** Пост-деплой: досоздать строки работ для фото всех студий (идемпотентно). */
export async function syncAllStudioPortfolioItemsWith(
  db: PrismaClient,
): Promise<StudioPortfolioSyncResult> {
  const studios = await db.studio.findMany({ select: { providerId: true } });
  const total: StudioPortfolioSyncResult = { created: 0, removed: 0 };
  for (const studio of studios) {
    const result = await syncStudioPortfolioItemsWith(db, studio.providerId);
    total.created += result.created;
    total.removed += result.removed;
  }
  return total;
}
