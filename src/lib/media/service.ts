import { randomUUID } from "crypto";
import {
  MediaAssetStatus,
  MediaEntityType,
  MediaKind,
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
import {
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_MAX_FILE_SIZE_BYTES,
  MEDIA_PORTFOLIO_LIMIT,
  MEDIA_USER_STORAGE_QUOTA_BYTES,
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
import { enqueue } from "@/lib/queue/queue";
import { logError } from "@/lib/logging/logger";

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

function studioBannerSettingKey(studioProviderId: string): string {
  return `studioBannerAssetId:${studioProviderId}`;
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
  await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: { deletedAt: new Date() },
  });

  // 2. Best-effort delete from storage. Swallow errors — a transient S3 outage
  //    must not surface to the user when the logical delete already succeeded.
  //    TODO: weekly cron to sweep S3 for files without a live MediaAsset row.
  try {
    const storage = getStorageProvider();
    await storage.deleteObject(asset.storageKey);
  } catch (error) {
    logError("Failed to delete media object from storage (record already soft-deleted)", {
      assetId: asset.id,
      storageKey: asset.storageKey,
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

async function enforceUserStorageQuota(userId: string, incomingBytes: number): Promise<void> {
  const used = await prisma.mediaAsset.aggregate({
    where: { createdByUserId: userId, deletedAt: null },
    _sum: { sizeBytes: true },
  });

  if (exceedsStorageQuota({ usedBytes: used._sum.sizeBytes ?? 0, incomingBytes })) {
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

  const publicItem = await prisma.portfolioItem.findFirst({
    where: { isPublic: true, mediaUrl: { contains: asset.id } },
    select: { id: true },
  });
  return Boolean(publicItem);
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

export async function uploadMediaAsset(user: SessionUser, input: UploadMediaInput): Promise<MediaAssetDto> {
  validateUploadBasics(input);
  const entityId = normalizeEntityId(input.entityId);

  await ensureCanManageMedia(user, input.entityType, entityId, input.kind);

  if (input.kind === MediaKind.PORTFOLIO && !input.replaceAssetId) {
    await enforcePortfolioLimit(user.id, input.entityType, entityId);
  }

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
    await deleteAssetById(replaceAsset.id);
  }

  if (input.kind === MediaKind.AVATAR && !input.replaceAssetId) {
    const existingAvatars = await prisma.mediaAsset.findMany({
      where: {
        entityType: input.entityType,
        entityId,
        kind: MediaKind.AVATAR,
        deletedAt: null,
      },
      select: { id: true },
    });
    for (const avatar of existingAvatars) {
      await deleteAssetById(avatar.id);
    }
  }

  // SEC-17: после веток замены/вытеснения — они освобождают байты, и на границе
  // квоты замена файла обязана проходить.
  await enforceUserStorageQuota(user.id, input.sizeBytes);

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
  }

  if (
    input.kind === MediaKind.AVATAR &&
    (input.entityType === MediaEntityType.MASTER || input.entityType === MediaEntityType.STUDIO)
  ) {
    await prisma.provider.update({
      where: { id: entityId },
      data: { avatarUrl: `/api/media/file/${readyAsset.id}` },
    });
  }


  if (
    input.entityType === MediaEntityType.MASTER &&
    (input.kind === MediaKind.AVATAR || input.kind === MediaKind.PORTFOLIO)
  ) {
    await invalidateAdvisorCache(entityId);
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
      select: { id: true },
    });
    await prisma.provider.update({
      where: { id: asset.entityId },
      data: {
        avatarUrl: nextAvatar ? `/api/media/file/${nextAvatar.id}` : null,
      },
    });
  }

  if (
    asset.entityType === MediaEntityType.MASTER &&
    (asset.kind === MediaKind.AVATAR || asset.kind === MediaKind.PORTFOLIO)
  ) {
    await invalidateAdvisorCache(asset.entityId);
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
    select: { id: true },
  });

  if (avatar?.id) return `/api/media/file/${avatar.id}`;
  return input.externalUrl ?? null;
}
