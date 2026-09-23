import { MediaAssetStatus, MediaEntityType, MediaKind } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { findHiddenPortfolioAssetIds } from "@/lib/media/service";
import { buildMediaFileUrl } from "@/lib/media/types";
import { prisma } from "@/lib/prisma";
import { isStudioPortfolioAsset } from "@/lib/studios/banner";

/**
 * CATALOG-MAIN-PHOTO — главное фото студии в карточке каталога.
 *
 * Выбирается из портфолио студии (`MediaAsset`, entity STUDIO) и хранится там
 * же, где баннер (`banner.ts`): ключ настройки на студию. Без выбора главным
 * считается самое свежее фото портфолио — так карточка вела бы себя и сама.
 *
 * Карточка студии до этого показывала ТОЛЬКО работы её мастеров, а
 * собственное портфолио студии (то, что видно на её странице) — нет. Теперь
 * первыми идут фото студии (главное впереди), работы мастеров — добором.
 */
function coverSettingKey(studioProviderId: string): string {
  return `studioCatalogCoverAssetId:${studioProviderId}`;
}

/** Сколько фото студии брать в карточку (сверх главного). */
const STUDIO_CARD_OWN_PHOTOS = 8;

export async function getStudioCatalogCoverAssetId(studioProviderId: string): Promise<string | null> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: coverSettingKey(studioProviderId) },
    select: { value: true },
  });
  return setting?.value ?? null;
}

export async function setStudioCatalogCoverAssetId(
  studioProviderId: string,
  assetId: string | null,
): Promise<void> {
  const key = coverSettingKey(studioProviderId);
  if (!assetId) {
    await prisma.appSetting.deleteMany({ where: { key } });
    return;
  }
  if (!(await isStudioPortfolioAsset(studioProviderId, assetId))) {
    throw new AppError("Выберите фото из портфолио студии.", 400, "MEDIA_ASSET_NOT_FOUND");
  }
  await prisma.appSetting.upsert({
    where: { key },
    update: { value: assetId },
    create: { key, value: assetId },
  });
}

/**
 * Фото портфолио студий для карточек выдачи: по студии — ссылки, главное
 * первым. Видимость — та же, что у публичного списка портфолио студии
 * (`listMediaAssets`): готовые, не удалённые, не привязанные к скрытой работе.
 */
export async function loadStudioCardPhotos(studioProviderIds: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const ids = [...new Set(studioProviderIds)];
  if (ids.length === 0) return result;

  const [covers, assets] = await Promise.all([
    prisma.appSetting.findMany({
      where: { key: { in: ids.map(coverSettingKey) } },
      select: { key: true, value: true },
    }),
    prisma.mediaAsset.findMany({
      where: {
        entityType: MediaEntityType.STUDIO,
        entityId: { in: ids },
        kind: MediaKind.PORTFOLIO,
        deletedAt: null,
        status: MediaAssetStatus.READY,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, entityId: true },
    }),
  ]);

  const coverByStudio = new Map<string, string>();
  for (const id of ids) {
    const cover = covers.find((row) => row.key === coverSettingKey(id));
    if (cover?.value) coverByStudio.set(id, cover.value);
  }

  // До проверки видимости — только то, что попадёт в карточку: главное и
  // N свежих на студию (проверка скрытых идёт `contains` по ссылкам работ).
  const candidatesByStudio = new Map<string, string[]>();
  for (const asset of assets) {
    const list = candidatesByStudio.get(asset.entityId) ?? [];
    const isCover = coverByStudio.get(asset.entityId) === asset.id;
    if (isCover) list.unshift(asset.id);
    else if (list.length < STUDIO_CARD_OWN_PHOTOS + 1) list.push(asset.id);
    candidatesByStudio.set(asset.entityId, list);
  }

  const hidden = await findHiddenPortfolioAssetIds([...candidatesByStudio.values()].flat());
  for (const [studioId, candidates] of candidatesByStudio) {
    const visible = candidates.filter((assetId) => !hidden.has(assetId)).slice(0, STUDIO_CARD_OWN_PHOTOS);
    if (visible.length > 0) result.set(studioId, visible.map(buildMediaFileUrl));
  }
  return result;
}
