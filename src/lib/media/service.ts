import { randomUUID } from "crypto";
import {
  MediaAssetStatus,
  MediaEntityType,
  MediaKind,
  Prisma,
  SubscriptionScope,
  type MediaAsset,
} from "@prisma/client";
import { Readable } from "stream";
import { AppError } from "@/lib/api/errors";
import { getCurrentPlan } from "@/lib/billing/get-current-plan";
import { createLimitReachedError } from "@/lib/billing/guards";
import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/media/storage";
import { deleteMediaPreviews } from "@/lib/media/preview-variants";
import {
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_MAX_FILE_SIZE_BYTES,
  MEDIA_PORTFOLIO_LIMIT,
  MEDIA_USER_STORAGE_QUOTA_BYTES,
  buildAvatarDisplayUrl,
  toMediaAssetDto,
  type MediaAssetDto,
} from "@/lib/media/types";
import { canManageProvider, ensureCanManageMedia, ensureCanReadMedia } from "@/lib/media/access";
import {
  SITE_LOGIN_HERO_FOCAL_SETTING_KEY,
  SITE_LOGIN_HERO_SETTING_KEY,
  SITE_LOGO_FOCAL_SETTING_KEY,
  SITE_LOGO_SETTING_KEY,
} from "@/lib/media/settings";
import { invalidateAdvisorCache } from "@/lib/advisor/cache";
import { carryPortfolioItem, syncStudioPortfolioItemsSafe } from "@/lib/studios/portfolio-items";
import { invalidateStoriesCache } from "@/lib/feed/stories.service";
import { studioBannerSettingKey } from "@/lib/studios/portfolio-items-sync";
import { invalidateSiteAssetCache } from "@/lib/media/site-asset-cache";
import { enqueue } from "@/lib/queue/queue";
import { logError } from "@/lib/logging/logger";
import { invalidateMeIdentityCache } from "@/lib/users/me";

type UploadMediaInput = {
  entityType: MediaEntityType;
  entityId: string;
  kind: MediaKind;
  replaceAssetId?: string;
  mimeType: string;
  sizeBytes: number;
  bytes: Uint8Array;
  originalFilename: string;
};

export type MediaFileResult = {
  stream: ReadableStream;
  contentType: string;
  contentLength: number;
};

function fileExtFromMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "bin";
}

function normalizeEntityId(entityId: string): string {
  return entityId.trim();
}

async function clearSystemConfigFocal(key: string): Promise<void> {
  await prisma.systemConfig.deleteMany({ where: { key } });
}

function validateUploadBasics(input: UploadMediaInput): void {
  if (!input.entityId.trim()) {
    throw new AppError("Не удалось загрузить фото. Обновите страницу и попробуйте ещё раз.", 400, "MEDIA_ENTITY_ID_REQUIRED");
  }
  if (!MEDIA_ALLOWED_MIME_TYPES.includes(input.mimeType as (typeof MEDIA_ALLOWED_MIME_TYPES)[number])) {
    throw new AppError("Неподдерживаемый формат изображения.", 400, "MEDIA_INVALID_MIME");
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > MEDIA_MAX_FILE_SIZE_BYTES) {
    throw new AppError("Файл слишком большой.", 400, "MEDIA_FILE_TOO_LARGE");
  }
}

function buildStorageKey(input: UploadMediaInput): string {
  const ext = fileExtFromMime(input.mimeType);
  const stamp = Date.now();
  const token = randomUUID();
  return `${input.entityType.toLowerCase()}/${input.entityId}/${input.kind.toLowerCase()}-${stamp}-${token}.${ext}`;
}

// Exported for unit tests only — call sites use deleteMediaAsset / cleanup helpers.
export async function deleteAssetById(assetId: string): Promise<void> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.deletedAt) return;

  // 1. Mark deleted in DB FIRST so the route stops serving the asset
  //    immediately. If step 2 fails, the worst case is an orphan FILE in S3
  //    (small disk leak, cleaned by future cron) — not an orphan RECORD
  //    that would surface as 404 to users.
  //    29.09 доработки · 16 (RKN-AUDIT-01): в той же транзакции уходят данные,
  //    выведенные из фото для визуального поиска, — эмбеддинг и `visual*`.
  //    Каскад `onDelete` срабатывает только при ЖЁСТКОМ удалении, а удаление
  //    здесь мягкое, поэтому раньше они жили вечно (хранение без цели, 152-ФЗ
  //    ст. 5 ч. 7). `visualIndexed` не трогаем: иначе переиндексация поставила
  //    бы удалённое фото в очередь. Это ЕДИНСТВЕННЫЙ писатель `deletedAt` у
  //    `MediaAsset` (сторож `media/soft-delete-single-writer.test.ts`).
  await prisma.$transaction([
    prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        deletedAt: new Date(),
        visualDescription: null,
        visualMeta: Prisma.DbNull,
        visualCategory: null,
      },
    }),
    prisma.mediaAssetEmbedding.deleteMany({ where: { assetId: asset.id } }),
  ]);

  // 29.09 доработки · 20: удалённая картинка сайта не должна жить в кэше шапки.
  if (asset.entityType === MediaEntityType.SITE) await invalidateSiteAssetCache();

  // 2. Best-effort delete from storage. Swallow errors — a transient S3 outage
  //    must not surface to the user when the logical delete already succeeded.
  //    MEDIA-STORAGE-ORPHAN-SWEEP: неудача не теряется — без отметки
  //    `storageDeletedAt` (шаг 4) удаление повторит ежечасная уборка воркера
  //    (`sweepDeletedAssetStorage`, `media/cleanup.ts`).
  let storageCleared = true;
  try {
    const storage = getStorageProvider();
    await storage.deleteObject(asset.storageKey);
  } catch (error) {
    storageCleared = false;
    logError("Failed to delete media object from storage (record already soft-deleted)", {
      assetId: asset.id,
      storageKey: asset.storageKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // 3. MOBILE-B1: превью `?w=` — производные байты того же фото, переживать
  //    оригинал не должны. Строго ПОСЛЕ пометки `deletedAt` (шаг 1): вариант,
  //    записанный параллельным запросом до неё, удаляется здесь, после неё —
  //    самим запросом (`lib/media/preview-variants.ts`). Отдельный try, чтобы
  //    сбой оригинала не оставлял варианты и наоборот.
  try {
    await deleteMediaPreviews(getStorageProvider(), asset.storageKey);
  } catch (error) {
    storageCleared = false;
    logError("Failed to delete media previews from storage (record already soft-deleted)", {
      assetId: asset.id,
      storageKey: asset.storageKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // 4. Отметка «байты убраны» — только когда ушли и оригинал, и превью. Сбой
  //    самой отметки не страшен: уборка повторит удаление, оно идемпотентно.
  if (storageCleared) await markAssetStorageDeleted(asset.id);
}

/**
 * MEDIA-STORAGE-ORPHAN-SWEEP — отметить, что объект удалённого фото убран из
 * хранилища. Только у мягко удалённой строки и только один раз.
 */
async function markAssetStorageDeleted(assetId: string): Promise<void> {
  try {
    await prisma.mediaAsset.updateMany({
      where: { id: assetId, deletedAt: { not: null }, storageDeletedAt: null },
      data: { storageDeletedAt: new Date() },
    });
  } catch (error) {
    logError("Failed to mark media storage as deleted", {
      assetId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function resolvePortfolioLimit(input: {
  userId: string;
  entityType: MediaEntityType;
  entityId: string;
}): Promise<{ limitKey: string | null; limit: number | null }> {
  if (input.entityType === MediaEntityType.STUDIO) {
    const plan = await getCurrentPlan(input.userId, SubscriptionScope.STUDIO);
    return {
      limitKey: "maxPortfolioPhotosStudioDesign",
      limit: plan.features.maxPortfolioPhotosStudioDesign,
    };
  }

  if (input.entityType === MediaEntityType.MASTER) {
    const provider = await prisma.provider.findUnique({
      where: { id: input.entityId },
      select: { id: true, type: true, studioId: true },
    });
    if (!provider || provider.type !== "MASTER") {
      return { limitKey: null, limit: MEDIA_PORTFOLIO_LIMIT };
    }
    const plan = await getCurrentPlan(input.userId, SubscriptionScope.MASTER);
    return provider.studioId
      ? {
          limitKey: "maxPortfolioPhotosPerStudioMaster",
          limit: plan.features.maxPortfolioPhotosPerStudioMaster,
        }
      : {
          limitKey: "maxPortfolioPhotosSolo",
          limit: plan.features.maxPortfolioPhotosSolo,
        };
  }

  return { limitKey: null, limit: MEDIA_PORTFOLIO_LIMIT };
}

async function enforcePortfolioLimit(
  userId: string,
  entityType: MediaEntityType,
  entityId: string
): Promise<void> {
  const excludedAssetIds: string[] = [];

  if (entityType === MediaEntityType.STUDIO) {
    const bannerSetting = await prisma.appSetting.findUnique({
      where: { key: studioBannerSettingKey(entityId) },
      select: { value: true },
    });
    if (bannerSetting?.value) {
      excludedAssetIds.push(bannerSetting.value);
    }
  }

  if (entityType === MediaEntityType.SITE && entityId === "site") {
    const heroSetting = await prisma.appSetting.findUnique({
      where: { key: SITE_LOGIN_HERO_SETTING_KEY },
      select: { value: true },
    });
    if (heroSetting?.value) {
      excludedAssetIds.push(heroSetting.value);
    }
  }

  const count = await prisma.mediaAsset.count({
    where: {
      entityType,
      entityId,
      kind: MediaKind.PORTFOLIO,
      deletedAt: null,
      status: MediaAssetStatus.READY,
      ...(excludedAssetIds.length > 0 ? { id: { notIn: excludedAssetIds } } : {}),
    },
  });

  const { limitKey, limit } = await resolvePortfolioLimit({ userId, entityType, entityId });
  if (limit === null) return;
  if (count >= limit) {
    if (limitKey) {
      throw createLimitReachedError(limitKey, limit, count);
    }
    throw new AppError("В портфолио больше работ не поместится. Удалите старую или перейдите на тариф выше.", 409, "MEDIA_PORTFOLIO_LIMIT_REACHED");
  }
}

/**
 * SEC-17 — суммарная байтовая квота на аккаунт.
 *
 * Якорь — `createdByUserId`, а не провайдер: злоупотребляет аккаунт, у него уже
 * есть индекс, и он единственный общий знаменатель для всех поверхностей
 * загрузки (портфолио, аватар, фото карточек, вложения чата, референсы броней),
 * тогда как `entityType`/`entityId` у них разные.
 *
 * Считаются только живые строки: `deleteAssetById` удаляет объект из хранилища
 * следом за пометкой `deletedAt`, поэтому удалённый ассет места уже не занимает
 * и держать его в сумме означало бы наказывать за уборку.
 *
 * Проверка стоит ПОСЛЕ веток замены и вытеснения аватара — они освобождают
 * байты, и на границе квоты замена файла обязана проходить.
 */
export function exceedsStorageQuota(input: {
  usedBytes: number;
  incomingBytes: number;
  quotaBytes?: number;
}): boolean {
  const quota = input.quotaBytes ?? MEDIA_USER_STORAGE_QUOTA_BYTES;
  return input.usedBytes + input.incomingBytes > quota;
}

async function enforceUserStorageQuota(
  userId: string,
  incomingBytes: number,
  /** Байты, которые освободит эта же загрузка (замена / вытеснение аватара). */
  releasingBytes = 0,
): Promise<void> {
  const used = await prisma.mediaAsset.aggregate({
    where: { createdByUserId: userId, deletedAt: null },
    _sum: { sizeBytes: true },
  });
  const usedBytes = Math.max(0, (used._sum.sizeBytes ?? 0) - releasingBytes);

  if (exceedsStorageQuota({ usedBytes, incomingBytes })) {
    throw new AppError(
      "Место для файлов закончилось. Удалите ненужные файлы.",
      409,
      "MEDIA_STORAGE_QUOTA_EXCEEDED",
    );
  }
}

/**
 * SECURITY-EXPOSURE-AUDIT-01 #3 — is a MASTER/STUDIO/SITE portfolio-or-avatar
 * asset visible to an anonymous / non-owner caller?
 *
 *  - AVATAR / SITE: public by nature (a single profile image / admin-managed
 *    site asset). Gating them would break authenticated surfaces that show a
 *    provider's avatar without adding protection the finding is about.
 *  - PORTFOLIO: visible ONLY when its provider is published AND a **public**
 *    `PortfolioItem` still references it. This closes all three leaks — a hidden
 *    item (`isPublic:false`), an unpublished provider, and a delete-orphaned
 *    asset (whose PortfolioItem is gone) all resolve to `false`.
 *
 * The `PortfolioItem` ↔ asset link is by `mediaUrl` (there is no FK). `mediaUrl`
 * is stored either relative (`/api/media/file/<id>`) or, for legacy rows,
 * absolute, so we match on `contains: <assetId>` — the asset id is a cuid,
 * globally unique, so this cannot false-match another item.
 */
/**
 * Единственная запись ссылки аватара кабинета в `Provider.avatarUrl`.
 *
 * STUDIO-MASTER-PROFILES (этап 4): у мастера может быть профиль в студии, и
 * своего аватара у него обычно нет — он показывает аватар ЛИЧНОГО профиля
 * (миграция и приём приглашения ставят ему ту же ссылку). Смена личного
 * аватара удаляет прежний файл, поэтому ссылка переносится на профили в
 * студиях, которые показывали прежний (или никакой). Профиль, которому студия
 * поставила свой аватар, не трогается.
 */
async function writeProviderAvatarUrl(providerId: string, nextUrl: string | null): Promise<void> {
  const previous = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { avatarUrl: true, ownerUserId: true, masterProfile: { select: { id: true } } },
  });
  await prisma.provider.update({ where: { id: providerId }, data: { avatarUrl: nextUrl } });
  if (!previous?.masterProfile || !previous.ownerUserId) return;
  await prisma.provider.updateMany({
    where: {
      ownerUserId: previous.ownerUserId,
      type: "MASTER",
      masterProfile: { is: null },
      OR: [{ avatarUrl: null }, ...(previous.avatarUrl ? [{ avatarUrl: previous.avatarUrl }] : [])],
    },
    data: { avatarUrl: nextUrl },
  });
}

/** CROP-PUBLIC-01 — всё, что нужно `buildAvatarDisplayUrl`. */
const AVATAR_URL_SELECT = {
  id: true,
  cropX: true,
  cropY: true,
  cropWidth: true,
  cropHeight: true,
} as const;

export async function isProviderMediaPubliclyVisible(asset: {
  id: string;
  entityType: MediaEntityType;
  entityId: string;
  kind: MediaKind;
}): Promise<boolean> {
  if (asset.entityType === MediaEntityType.SITE) return true;
  if (asset.kind === MediaKind.AVATAR) return true;
  if (asset.kind !== MediaKind.PORTFOLIO) return false;
  if (asset.entityType !== MediaEntityType.MASTER && asset.entityType !== MediaEntityType.STUDIO) {
    return false;
  }

  const provider = await prisma.provider.findUnique({
    where: { id: asset.entityId },
    select: { isPublished: true },
  });
  if (!provider?.isPublished) return false;

  // STUDIO-PHOTOS-PUBLIC-01: у студийного портфолио строк `PortfolioItem` нет
  // вовсе — фото студии И ЕСТЬ `MediaAsset` (редактор студии умеет только
  // загрузить, заменить и удалить; скрытого состояния у него нет). Правило
  // «нужна публичная работа» здесь не выполнялось НИКОГДА: каждое фото студии
  // отдавалось анониму и оптимизатору картинок как 403, и страница студии
  // показывала серые плитки. Для студии скрытым считается только фото, на
  // которое ссылается непубличная работа, — то же правило, что у визуального
  // поиска (`visual-search/searcher.ts`). Удалённые и не-READY ассеты отсекает
  // вызывающий раньше (404), неопубликованную студию — проверка выше.
  // STUDIO-PORTFOLIO-FEED: строки работ к фото студии теперь есть (публичные,
  // для ленты и историй), но не у текущего баннера — поэтому правило остаётся
  // «скрыто только привязанное к непубличной работе», а не «нужна публичная».
  if (asset.entityType === MediaEntityType.STUDIO) {
    const hiddenItem = await prisma.portfolioItem.findFirst({
      where: { isPublic: false, mediaUrl: { contains: asset.id } },
      select: { id: true },
    });
    return !hiddenItem;
  }

  const publicItem = await prisma.portfolioItem.findFirst({
    where: { isPublic: true, mediaUrl: { contains: asset.id } },
    select: { id: true },
  });
  return Boolean(publicItem);
}

/** STUDIO-PHOTOS-PUBLIC-01 — подмножество `assetIds`, на которые ссылается НЕпубличная работа. */
export async function findHiddenPortfolioAssetIds(assetIds: string[]): Promise<Set<string>> {
  const hidden = new Set<string>();
  if (assetIds.length === 0) return hidden;
  const items = await prisma.portfolioItem.findMany({
    where: { isPublic: false, OR: assetIds.map((id) => ({ mediaUrl: { contains: id } })) },
    select: { mediaUrl: true },
  });
  for (const id of assetIds) {
    if (items.some((item) => item.mediaUrl.includes(id))) hidden.add(id);
  }
  return hidden;
}

/** Subset of `assetIds` referenced by a public `PortfolioItem` (see above). */
async function filterPublicPortfolioAssetIds(assetIds: string[]): Promise<Set<string>> {
  const visible = new Set<string>();
  if (assetIds.length === 0) return visible;
  const items = await prisma.portfolioItem.findMany({
    where: { isPublic: true, OR: assetIds.map((id) => ({ mediaUrl: { contains: id } })) },
    select: { mediaUrl: true },
  });
  for (const id of assetIds) {
    if (items.some((item) => item.mediaUrl.includes(id))) visible.add(id);
  }
  return visible;
}

export async function listMediaAssets(
  user: SessionUser | null,
  input: { entityType: MediaEntityType; entityId: string; kind?: MediaKind }
): Promise<MediaAssetDto[]> {
  const entityId = normalizeEntityId(input.entityId);
  const { entityType, kind } = input;

  // Provider-owned public media (portfolio + avatar) is fetched by anonymous
  // public profiles, so it cannot go through the strict private-read gate. A
  // manager sees everything (incl. hidden items); everyone else sees only the
  // publicly-visible subset. Deleted providers/items resolve to empty because
  // the asset carries no public PortfolioItem (and a deleted provider is not
  // published). SECURITY-EXPOSURE-AUDIT-01 #3.
  const isProviderPublicSurface =
    (kind === MediaKind.PORTFOLIO || kind === MediaKind.AVATAR) &&
    (entityType === MediaEntityType.MASTER ||
      entityType === MediaEntityType.STUDIO ||
      entityType === MediaEntityType.SITE);

  if (isProviderPublicSurface) {
    const assets = await prisma.mediaAsset.findMany({
      where: { entityType, entityId, kind, deletedAt: null, status: MediaAssetStatus.READY },
      orderBy: { createdAt: "desc" },
    });

    const isManager =
      entityType !== MediaEntityType.SITE && user
        ? await canManageProvider(entityId, user.id)
        : false;
    if (isManager || entityType === MediaEntityType.SITE) {
      return assets.map(toMediaAssetDto);
    }

    // Non-manager: avatars are public; portfolio requires a published provider
    // and a public PortfolioItem.
    if (kind === MediaKind.AVATAR) return assets.map(toMediaAssetDto);

    const provider = await prisma.provider.findUnique({
      where: { id: entityId },
      select: { isPublished: true },
    });
    if (!provider?.isPublished) return [];

    // STUDIO-PHOTOS-PUBLIC-01: зеркало `isProviderMediaPubliclyVisible` — у
    // студии нет строк работ, поэтому видно всё, кроме привязанного к скрытой.
    if (entityType === MediaEntityType.STUDIO) {
      const hiddenIds = await findHiddenPortfolioAssetIds(assets.map((a) => a.id));
      return assets.filter((a) => !hiddenIds.has(a.id)).map(toMediaAssetDto);
    }

    const publicIds = await filterPublicPortfolioAssetIds(assets.map((a) => a.id));
    return assets.filter((a) => publicIds.has(a.id)).map(toMediaAssetDto);
  }

  // Every other entity type keeps the strict per-entity read authorization.
  await ensureCanReadMedia(user, entityType, entityId, kind);
  const assets = await prisma.mediaAsset.findMany({
    where: { entityType, entityId, kind, deletedAt: null, status: MediaAssetStatus.READY },
    orderBy: { createdAt: "desc" },
  });
  return assets.map(toMediaAssetDto);
}

/**
 * MOBILE-CLIENT-01: `GET /api/me` несёт аватар клиента (`avatarUrl`) и кэширует
 * ответ (`users/me.ts`) — после загрузки или удаления USER-аватара кадр
 * сбрасывается, иначе приложение до истечения TTL видело бы прежнюю картинку.
 * Сбой сброса не отменяет уже выполненную операцию — кадр истечёт сам.
 */
async function invalidateClientAvatarCaches(entityType: MediaEntityType, entityId: string, kind: MediaKind) {
  if (entityType !== MediaEntityType.USER || kind !== MediaKind.AVATAR) return;
  await invalidateMeIdentityCache(entityId).catch((error) => {
    logError("Failed to invalidate /api/me cache after avatar change", {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function uploadMediaAsset(user: SessionUser, input: UploadMediaInput): Promise<MediaAssetDto> {
  validateUploadBasics(input);
  const entityId = normalizeEntityId(input.entityId);

  await ensureCanManageMedia(user, input.entityType, entityId, input.kind);

  if (input.kind === MediaKind.PORTFOLIO && !input.replaceAssetId) {
    await enforcePortfolioLimit(user.id, input.entityType, entityId);
  }

  // 29.09 доработки · 00-13: заменяемое фото и вытесняемые аватары удаляются
  // ПОСЛЕ того, как новое сохранено. Раньше — до загрузки: при сбое загрузки
  // работа оставалась с битой картинкой, а профиль без аватара.
  const superseded: Array<{ id: string; sizeBytes: number; createdByUserId: string | null }> = [];
  if (input.replaceAssetId) {
    const replaceAsset = await prisma.mediaAsset.findUnique({
      where: { id: input.replaceAssetId },
    });
    if (
      !replaceAsset ||
      replaceAsset.deletedAt ||
      replaceAsset.entityType !== input.entityType ||
      replaceAsset.entityId !== entityId ||
      replaceAsset.kind !== input.kind
    ) {
      throw new AppError("Фото изменилось. Обновите страницу и попробуйте ещё раз.", 400, "MEDIA_REPLACE_ASSET_MISMATCH");
    }
    superseded.push(replaceAsset);
  }

  if (input.kind === MediaKind.AVATAR && !input.replaceAssetId) {
    const existingAvatars = await prisma.mediaAsset.findMany({
      where: {
        entityType: input.entityType,
        entityId,
        kind: MediaKind.AVATAR,
        deletedAt: null,
      },
      select: { id: true, sizeBytes: true, createdByUserId: true },
    });
    superseded.push(...existingAvatars);
  }

  // SEC-17: замена и вытеснение освобождают байты, и на границе квоты замена
  // файла обязана проходить — освобождаемое (своё) вычитается заранее.
  const releasingBytes = superseded
    .filter((asset) => asset.createdByUserId === user.id)
    .reduce((sum, asset) => sum + asset.sizeBytes, 0);
  await enforceUserStorageQuota(user.id, input.sizeBytes, releasingBytes);

  const storage = getStorageProvider();
  const storageKey = buildStorageKey({ ...input, entityId });
  const created = await prisma.mediaAsset.create({
    data: {
      entityType: input.entityType,
      entityId,
      kind: input.kind,
      storageProvider: storage.name,
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      originalFilename: input.originalFilename,
      createdByUserId: user.id,
      status: MediaAssetStatus.PENDING,
    },
  });
  let readyAsset: MediaAsset;
  try {
    await storage.putObject({
      key: storageKey,
      bytes: input.bytes,
      contentType: input.mimeType,
    });
    readyAsset = await prisma.mediaAsset.update({
      where: { id: created.id },
      data: { status: MediaAssetStatus.READY },
    });
  } catch (error) {
    await prisma.mediaAsset.delete({ where: { id: created.id } }).catch((cleanupError) => {
      logError("Failed to rollback media asset after upload failure", {
        assetId: created.id,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
    });
    throw error;
  }

  // STUDIO-PORTFOLIO-FEED / 29.09 · 01-в: при замене строка работы (подпись
  // студии; услуги, теги и видимость мастера) переезжает на новый файл — до
  // удаления старого, чтобы работа ни на миг не ссылалась на удалённое фото.
  if (
    input.replaceAssetId &&
    input.kind === MediaKind.PORTFOLIO &&
    (input.entityType === MediaEntityType.STUDIO || input.entityType === MediaEntityType.MASTER)
  ) {
    await carryPortfolioItem(entityId, input.replaceAssetId, readyAsset.id)
      .then(async (carried) => {
        // Истории студии обновляет синхронизация ниже; у мастера — здесь.
        if (carried > 0 && input.entityType === MediaEntityType.MASTER) await invalidateStoriesCache();
      })
      .catch((error) => {
        logError("Failed to carry portfolio item to replaced asset", {
          assetId: readyAsset.id,
          entityType: input.entityType,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  // Новое сохранено — теперь убираем заменённое. Сбой здесь не отменяет
  // загрузку: лишнее фото видно и удаляется руками, битое — нет.
  for (const asset of superseded) {
    await deleteAssetById(asset.id).catch((error) => {
      logError("Failed to delete superseded media asset", {
        assetId: asset.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  if (
    input.entityType === MediaEntityType.SITE &&
    entityId === "site" &&
    input.kind === MediaKind.AVATAR
  ) {
    await prisma.appSetting.upsert({
      where: { key: SITE_LOGO_SETTING_KEY },
      update: { value: readyAsset.id },
      create: { key: SITE_LOGO_SETTING_KEY, value: readyAsset.id },
    });
    await clearSystemConfigFocal(SITE_LOGO_FOCAL_SETTING_KEY);
    await invalidateSiteAssetCache();
  }

  if (
    input.entityType === MediaEntityType.SITE &&
    entityId === "site" &&
    input.kind === MediaKind.PORTFOLIO
  ) {
    await prisma.appSetting.upsert({
      where: { key: SITE_LOGIN_HERO_SETTING_KEY },
      update: { value: readyAsset.id },
      create: { key: SITE_LOGIN_HERO_SETTING_KEY, value: readyAsset.id },
    });
    await clearSystemConfigFocal(SITE_LOGIN_HERO_FOCAL_SETTING_KEY);
    await invalidateSiteAssetCache();
  }

  if (
    input.kind === MediaKind.AVATAR &&
    (input.entityType === MediaEntityType.MASTER || input.entityType === MediaEntityType.STUDIO)
  ) {
    await writeProviderAvatarUrl(entityId, buildAvatarDisplayUrl(readyAsset));
  }
  await invalidateClientAvatarCaches(input.entityType, entityId, input.kind);


  if (
    input.entityType === MediaEntityType.MASTER &&
    (input.kind === MediaKind.AVATAR || input.kind === MediaKind.PORTFOLIO)
  ) {
    await invalidateAdvisorCache(entityId);
  }

  // STUDIO-PORTFOLIO-FEED: фото студии — работа в ленте и историях (подпись
  // при замене перенесена выше, до удаления старого файла).
  if (input.entityType === MediaEntityType.STUDIO && input.kind === MediaKind.PORTFOLIO) {
    await syncStudioPortfolioItemsSafe(entityId);
  }

  if (input.kind === MediaKind.PORTFOLIO) {
    void enqueue({
      id: randomUUID(),
      type: "visual_search_index",
      payload: { assetId: readyAsset.id },
    }).catch((error) => {
      logError("Failed to enqueue visual search index job", {
        assetId: readyAsset.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return toMediaAssetDto(readyAsset);
}

export async function uploadBookingReferenceAsset(
  user: SessionUser | null,
  input: {
    mimeType: string;
    sizeBytes: number;
    bytes: Uint8Array;
    originalFilename: string;
  }
): Promise<{ id: string }> {
  const entityId = `pending:${user?.id ?? randomUUID()}`;
  validateUploadBasics({
    entityType: MediaEntityType.BOOKING,
    entityId,
    kind: MediaKind.BOOKING_REFERENCE,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    bytes: input.bytes,
    originalFilename: input.originalFilename,
  });

  const storage = getStorageProvider();
  const storageKey = buildStorageKey({
    entityType: MediaEntityType.BOOKING,
    entityId,
    kind: MediaKind.BOOKING_REFERENCE,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    bytes: input.bytes,
    originalFilename: input.originalFilename,
  });
  const created = await prisma.mediaAsset.create({
    data: {
      entityType: MediaEntityType.BOOKING,
      entityId,
      kind: MediaKind.BOOKING_REFERENCE,
      storageProvider: storage.name,
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      originalFilename: input.originalFilename,
      createdByUserId: user?.id ?? null,
      status: MediaAssetStatus.PENDING,
    },
    select: { id: true },
  });
  try {
    await storage.putObject({
      key: storageKey,
      bytes: input.bytes,
      contentType: input.mimeType,
    });
    await prisma.mediaAsset.update({
      where: { id: created.id },
      data: { status: MediaAssetStatus.READY },
    });
  } catch (error) {
    await prisma.mediaAsset.delete({ where: { id: created.id } }).catch((cleanupError) => {
      logError("Failed to rollback booking reference asset after upload failure", {
        assetId: created.id,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
    });
    throw error;
  }

  return { id: created.id };
}

/**
 * Upload a chat-attachment image (CHAT-FOUNDATION-A-MIGRATION).
 *
 * Byte-for-byte mirror of `uploadBookingReferenceAsset` — the only
 * differences are `entityType=CHAT_MESSAGE` and `kind=CHAT_ATTACHMENT`.
 * Same `pending:<userId>` entityId convention, same owner-scoped
 * createdByUserId, same status flow (PENDING during put → READY on
 * success, row deleted on storage failure).
 *
 * The asset is "claimed" by the chat-message sender flow when it
 * persists the link (see `attachChatAttachment` in `message-sender`).
 * Until then it lives as PENDING + entityId starting with `pending:`,
 * which is what the validator checks to enforce one-shot use.
 */
export async function uploadChatAttachmentAsset(
  user: SessionUser,
  input: {
    mimeType: string;
    sizeBytes: number;
    bytes: Uint8Array;
    originalFilename: string;
  },
): Promise<{ id: string }> {
  const entityId = `pending:${user.id}`;
  validateUploadBasics({
    entityType: MediaEntityType.CHAT_MESSAGE,
    entityId,
    kind: MediaKind.CHAT_ATTACHMENT,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    bytes: input.bytes,
    originalFilename: input.originalFilename,
  });

  const storage = getStorageProvider();
  const storageKey = buildStorageKey({
    entityType: MediaEntityType.CHAT_MESSAGE,
    entityId,
    kind: MediaKind.CHAT_ATTACHMENT,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    bytes: input.bytes,
    originalFilename: input.originalFilename,
  });
  const created = await prisma.mediaAsset.create({
    data: {
      entityType: MediaEntityType.CHAT_MESSAGE,
      entityId,
      kind: MediaKind.CHAT_ATTACHMENT,
      storageProvider: storage.name,
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      originalFilename: input.originalFilename,
      createdByUserId: user.id,
      status: MediaAssetStatus.PENDING,
    },
    select: { id: true },
  });
  try {
    await storage.putObject({
      key: storageKey,
      bytes: input.bytes,
      contentType: input.mimeType,
    });
    await prisma.mediaAsset.update({
      where: { id: created.id },
      data: { status: MediaAssetStatus.READY },
    });
  } catch (error) {
    await prisma.mediaAsset.delete({ where: { id: created.id } }).catch((cleanupError) => {
      logError("Failed to rollback chat attachment asset after upload failure", {
        assetId: created.id,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
    });
    throw error;
  }

  return { id: created.id };
}

export async function deleteMediaAsset(user: SessionUser, assetId: string): Promise<{ id: string }> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
  });
  if (!asset || asset.deletedAt) {
    throw new AppError("Файл не найден.", 404, "MEDIA_ASSET_NOT_FOUND");
  }

  await ensureCanManageMedia(user, asset.entityType, asset.entityId, asset.kind);
  await deleteAssetById(asset.id);

  if (
    asset.entityType === MediaEntityType.SITE &&
    asset.entityId === "site" &&
    asset.kind === MediaKind.AVATAR
  ) {
    const removed = await prisma.appSetting.deleteMany({
      where: {
        key: SITE_LOGO_SETTING_KEY,
        value: asset.id,
      },
    });
    if (removed.count > 0) {
      await clearSystemConfigFocal(SITE_LOGO_FOCAL_SETTING_KEY);
    }
  }

  if (
    asset.entityType === MediaEntityType.SITE &&
    asset.entityId === "site" &&
    asset.kind === MediaKind.PORTFOLIO
  ) {
    const removed = await prisma.appSetting.deleteMany({
      where: {
        key: SITE_LOGIN_HERO_SETTING_KEY,
        value: asset.id,
      },
    });
    if (removed.count > 0) {
      await clearSystemConfigFocal(SITE_LOGIN_HERO_FOCAL_SETTING_KEY);
    }
  }

  if (
    asset.kind === MediaKind.AVATAR &&
    (asset.entityType === MediaEntityType.MASTER || asset.entityType === MediaEntityType.STUDIO)
  ) {
    const nextAvatar = await prisma.mediaAsset.findFirst({
      where: {
        entityType: asset.entityType,
        entityId: asset.entityId,
        kind: MediaKind.AVATAR,
        deletedAt: null,
        status: MediaAssetStatus.READY,
      },
      orderBy: { createdAt: "desc" },
      select: AVATAR_URL_SELECT,
    });
    await writeProviderAvatarUrl(asset.entityId, nextAvatar ? buildAvatarDisplayUrl(nextAvatar) : null);
  }
  await invalidateClientAvatarCaches(asset.entityType, asset.entityId, asset.kind);

  if (
    asset.entityType === MediaEntityType.MASTER &&
    (asset.kind === MediaKind.AVATAR || asset.kind === MediaKind.PORTFOLIO)
  ) {
    await invalidateAdvisorCache(asset.entityId);
  }

  // STUDIO-PORTFOLIO-FEED: удалённое фото студии уходит из ленты и историй.
  if (asset.entityType === MediaEntityType.STUDIO && asset.kind === MediaKind.PORTFOLIO) {
    await syncStudioPortfolioItemsSafe(asset.entityId);
  }

  return { id: asset.id };
}


export async function updateMediaCrop(
  user: SessionUser,
  assetId: string,
  input: { cropX: number; cropY: number; cropWidth: number; cropHeight: number }
): Promise<MediaAssetDto> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
  });
  if (!asset || asset.deletedAt) {
    throw new AppError("Файл не найден.", 404, "MEDIA_ASSET_NOT_FOUND");
  }

  await ensureCanManageMedia(user, asset.entityType, asset.entityId, asset.kind);

  const updated = await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: {
      cropX: input.cropX,
      cropY: input.cropY,
      cropWidth: input.cropWidth,
      cropHeight: input.cropHeight,
    },
  });

  // CROP-PUBLIC-01: публичная ссылка аватара несёт версию области, поэтому
  // новая область — новая ссылка в `Provider.avatarUrl`. Только если это
  // ТЕКУЩИЙ аватар кабинета (тот же выбор, что при удалении: последний READY).
  // У логотипа сайта ссылка из кэша шапки — сбросить (29.09 доработки · 20).
  if (updated.entityType === MediaEntityType.SITE) await invalidateSiteAssetCache();
  if (
    updated.kind === MediaKind.AVATAR &&
    (updated.entityType === MediaEntityType.MASTER || updated.entityType === MediaEntityType.STUDIO)
  ) {
    const current = await prisma.mediaAsset.findFirst({
      where: {
        entityType: updated.entityType,
        entityId: updated.entityId,
        kind: MediaKind.AVATAR,
        deletedAt: null,
        status: MediaAssetStatus.READY,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (current?.id === updated.id) {
      await writeProviderAvatarUrl(updated.entityId, buildAvatarDisplayUrl(updated));
    }
  }

  return toMediaAssetDto(updated);
}

export async function getMediaFile(
  user: SessionUser | null,
  assetId: string
): Promise<MediaFileResult> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
  });
  if (!asset || asset.deletedAt) {
    throw new AppError("Файл не найден.", 404, "MEDIA_ASSET_NOT_FOUND");
  }
  if (asset.status !== MediaAssetStatus.READY) {
    throw new AppError("Файл не найден.", 404, "MEDIA_ASSET_NOT_FOUND");
  }

  await ensureCanReadMedia(user, asset.entityType, asset.entityId, asset.kind);

  const storage = getStorageProvider();
  const file = await storage.getObject(asset.storageKey, asset.mimeType);
  if (!file) {
    throw new AppError("Файл не найден.", 404, "MEDIA_ASSET_NOT_FOUND", {
      reason: "STORAGE_MISSING",
      assetId: asset.id,
    });
  }

  return {
    stream: Readable.toWeb(file.stream) as ReadableStream,
    contentType: file.contentType,
    contentLength: file.sizeBytes,
  };
}

export async function getAvatarUrlForEntity(input: {
  entityType: MediaEntityType;
  entityId: string;
  externalUrl?: string | null;
}): Promise<string | null> {
  const avatar = await prisma.mediaAsset.findFirst({
    where: {
      entityType: input.entityType,
      entityId: input.entityId,
      kind: MediaKind.AVATAR,
      deletedAt: null,
      status: MediaAssetStatus.READY,
    },
    orderBy: { createdAt: "desc" },
    select: AVATAR_URL_SELECT,
  });

  if (avatar) return buildAvatarDisplayUrl(avatar);
  return input.externalUrl ?? null;
}
