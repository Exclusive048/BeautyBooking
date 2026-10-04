import { MediaAssetStatus, MediaEntityType, MediaKind, SubscriptionScope } from "@prisma/client";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { buildMediaFileUrl } from "@/lib/media/types";
import { prisma } from "@/lib/prisma";
import { getStudioBannerAssetId } from "@/lib/studios/banner";
import { getStudioCatalogCoverAssetId } from "@/lib/studios/catalog-cover";
import {
  getStudioPortfolioAttribution,
  type StudioPortfolioAttributionData,
} from "@/lib/studios/portfolio-items";

export type StudioPortfolioPhoto = {
  assetId: string;
  /** Относительная ссылка на файл (`/api/media/file/{id}`); превью — `?w=`. */
  url: string;
  createdAt: string;
  /** Баннер страницы студии: не работа и не считается в лимит. */
  isBanner: boolean;
  /** Выбрано главным фото карточки каталога (без выбора каталог берёт самое свежее). */
  isCatalogCover: boolean;
  performerId: string | null;
  serviceId: string | null;
};

export type StudioPortfolioView = {
  photos: StudioPortfolioPhoto[];
  masters: StudioPortfolioAttributionData["masters"];
  services: StudioPortfolioAttributionData["services"];
  /** `max` — лимит тарифа ВЫЗЫВАЮЩЕГО (как проверяет загрузка), `null` — без лимита. */
  limit: { max: number | null; used: number };
};

/**
 * MOBILE-STUDIO-C (§7) — портфолио студии одним чтением для приложения: фото
 * (как видит их управляющий — все готовые, не удалённые, новые сверху), подписи
 * «мастер · услуга», из кого/чего выбирать подпись, баннер, главное фото
 * каталога и лимит тарифа. Счёт `used` — правилом загрузки
 * (`enforcePortfolioLimit`): баннер не считается.
 */
export async function loadStudioPortfolioView(input: {
  studioProviderId: string;
  userId: string;
}): Promise<StudioPortfolioView> {
  const { studioProviderId } = input;
  const [assets, attribution, bannerAssetId, coverAssetId, plan] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: {
        entityType: MediaEntityType.STUDIO,
        entityId: studioProviderId,
        kind: MediaKind.PORTFOLIO,
        deletedAt: null,
        status: MediaAssetStatus.READY,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    }),
    getStudioPortfolioAttribution(studioProviderId),
    getStudioBannerAssetId(studioProviderId),
    getStudioCatalogCoverAssetId(studioProviderId),
    getCurrentPlan(input.userId, SubscriptionScope.STUDIO),
  ]);

  const captionByAsset = new Map(attribution.items.map((item) => [item.assetId, item]));
  const photos: StudioPortfolioPhoto[] = assets.map((asset) => {
    const caption = captionByAsset.get(asset.id);
    return {
      assetId: asset.id,
      url: buildMediaFileUrl(asset.id),
      createdAt: asset.createdAt.toISOString(),
      isBanner: asset.id === bannerAssetId,
      isCatalogCover: asset.id === coverAssetId,
      performerId: caption?.performerId ?? null,
      serviceId: caption?.serviceId ?? null,
    };
  });

  return {
    photos,
    masters: attribution.masters,
    services: attribution.services,
    limit: {
      max: plan.features.maxPortfolioPhotosStudioDesign,
      used: photos.filter((photo) => !photo.isBanner).length,
    },
  };
}
