import { ProviderType } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { invalidateStoriesCache } from "@/lib/feed/stories.service";
import { logError } from "@/lib/logging/logger";
import { buildMediaFileUrl } from "@/lib/media/types";
import { prisma } from "@/lib/prisma";
import { STUDIO_ACTIVE_MASTER_WHERE } from "@/lib/studio/master-eligibility";
import {
  syncStudioPortfolioItemsWith,
  type StudioPortfolioSyncResult,
} from "@/lib/studios/portfolio-items-sync";

/**
 * STUDIO-PORTFOLIO-FEED (2026-09-24) — фото студии в ленте и историях.
 *
 * Лента на главной и истории читают ТОЛЬКО `PortfolioItem`, а фото студии жили
 * одними строками `MediaAsset` (`entityType = STUDIO`), поэтому на главную не
 * попадали вовсе. Здесь каждому фото из портфолио студии соответствует строка
 * работы с `masterId` = Provider студии — лента группирует по нему, и автором
 * истории выступает студия. Фото по-прежнему хранится и редактируется как
 * `MediaAsset` (страница студии, лимит тарифа, обложка каталога — без
 * изменений); строка работы несёт то, чего у файла нет: исполнителя
 * (`performerId`) и услугу — подпись «мастер · услуга» на фото.
 *
 * Правило «какое фото студии — работа» одно и живёт здесь: живое READY-фото
 * портфолио, кроме текущего баннера (обложка страницы, а не работа).
 * `syncStudioPortfolioItems` сводит строки к этому правилу идемпотентно
 * (ядро — `portfolio-items-sync.ts`): зовут его загрузка, удаление, смена
 * баннера и пост-деплой (досоздание для фото, загруженных до этой фичи).
 */

export type { StudioPortfolioSyncResult };

export async function syncStudioPortfolioItems(
  studioProviderId: string,
): Promise<StudioPortfolioSyncResult> {
  const result = await syncStudioPortfolioItemsWith(prisma, studioProviderId);
  if (result.created > 0 || result.removed > 0) {
    await invalidateStoriesCache();
  }
  return result;
}

/**
 * Синхронизация после действия в кабинете — не ломает само действие: фото уже
 * загружено/удалено, а расхождение с лентой лечит следующая синхронизация.
 */
export async function syncStudioPortfolioItemsSafe(studioProviderId: string): Promise<void> {
  try {
    await syncStudioPortfolioItems(studioProviderId);
  } catch (error) {
    logError("syncStudioPortfolioItems failed", {
      studioProviderId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * «Заменить фото» создаёт НОВЫЙ `MediaAsset` и удаляет старый. Подпись
 * (исполнитель, услуга) и дата работы переезжают на новое фото, а не теряются.
 */
export async function carryStudioPortfolioItem(
  studioProviderId: string,
  fromAssetId: string,
  toAssetId: string,
): Promise<void> {
  await prisma.portfolioItem.updateMany({
    where: { masterId: studioProviderId, mediaUrl: buildMediaFileUrl(fromAssetId) },
    data: { mediaUrl: buildMediaFileUrl(toAssetId) },
  });
}

export type StudioPortfolioAttributionItem = {
  assetId: string;
  performerId: string | null;
  serviceId: string | null;
};

export type StudioPortfolioAttributionData = {
  items: StudioPortfolioAttributionItem[];
  masters: Array<{ id: string; name: string; serviceIds: string[] }>;
  services: Array<{ id: string; title: string }>;
};

const ASSET_ID_FROM_URL = /\/api\/media\/file\/([^/?#]+)/;

function assetIdFromMediaUrl(mediaUrl: string): string | null {
  return mediaUrl.match(ASSET_ID_FROM_URL)?.[1] ?? null;
}

/** Данные для кабинета: подпись каждого фото + кого и что можно выбрать. */
export async function getStudioPortfolioAttribution(
  studioProviderId: string,
): Promise<StudioPortfolioAttributionData> {
  await syncStudioPortfolioItems(studioProviderId);

  const [items, masters, services] = await Promise.all([
    prisma.portfolioItem.findMany({
      where: { masterId: studioProviderId },
      select: {
        mediaUrl: true,
        performerId: true,
        services: { select: { serviceId: true }, orderBy: { createdAt: "asc" }, take: 1 },
      },
    }),
    prisma.provider.findMany({
      where: { studioId: studioProviderId, type: ProviderType.MASTER, ...STUDIO_ACTIVE_MASTER_WHERE },
      select: {
        id: true,
        name: true,
        masterServices: { where: { isEnabled: true }, select: { serviceId: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.service.findMany({
      where: { providerId: studioProviderId, isActive: true },
      select: { id: true, name: true, title: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    items: items.flatMap((item) => {
      const assetId = assetIdFromMediaUrl(item.mediaUrl);
      return assetId
        ? [{ assetId, performerId: item.performerId, serviceId: item.services[0]?.serviceId ?? null }]
        : [];
    }),
    masters: masters.map((master) => ({
      id: master.id,
      name: master.name,
      serviceIds: master.masterServices.map((link) => link.serviceId),
    })),
    services: services.map((service) => ({
      id: service.id,
      title: service.title?.trim() || service.name,
    })),
  };
}

/**
 * Подпись фото студии: исполнитель — мастер ЭТОЙ студии, услуга — услуга ЭТОЙ
 * студии. Чужой id не проходит (404), а не записывается молча.
 */
export async function setStudioPortfolioAttribution(input: {
  studioProviderId: string;
  assetId: string;
  performerId: string | null;
  serviceId: string | null;
}): Promise<StudioPortfolioAttributionItem> {
  const { studioProviderId, assetId, performerId, serviceId } = input;

  const [performer, service] = await Promise.all([
    performerId
      ? prisma.provider.findFirst({
          where: { id: performerId, studioId: studioProviderId, type: ProviderType.MASTER },
          select: { id: true },
        })
      : null,
    serviceId
      ? prisma.service.findFirst({
          where: { id: serviceId, providerId: studioProviderId },
          select: { id: true },
        })
      : null,
  ]);
  if (performerId && !performer) {
    throw new AppError("Мастер не найден в этой студии.", 404, "MASTER_NOT_FOUND");
  }
  if (serviceId && !service) {
    throw new AppError("Услуга не найдена в этой студии.", 404, "SERVICE_NOT_FOUND");
  }

  await syncStudioPortfolioItems(studioProviderId);
  const item = await prisma.portfolioItem.findFirst({
    where: { masterId: studioProviderId, mediaUrl: buildMediaFileUrl(assetId) },
    select: { id: true },
  });
  if (!item) {
    throw new AppError("Фото не найдено. Обновите страницу.", 404, "MEDIA_ASSET_NOT_FOUND");
  }

  await prisma.$transaction([
    prisma.portfolioItem.update({ where: { id: item.id }, data: { performerId } }),
    prisma.portfolioItemService.deleteMany({ where: { portfolioItemId: item.id } }),
    ...(serviceId
      ? [prisma.portfolioItemService.create({ data: { portfolioItemId: item.id, serviceId } })]
      : []),
  ]);
  await invalidateStoriesCache();

  return { assetId, performerId, serviceId };
}
