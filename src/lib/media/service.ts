import { randomUUID } from "crypto";
import { MediaEntityType, MediaKind, type UserProfile } from "@prisma/client";
import { Readable } from "stream";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/media/storage";
import { MEDIA_ALLOWED_MIME_TYPES, MEDIA_MAX_FILE_SIZE_BYTES, MEDIA_PORTFOLIO_LIMIT, toMediaAssetDto, type MediaAssetDto } from "@/lib/media/types";
import { ensureCanManageMedia, ensureCanReadMedia } from "@/lib/media/access";
import { SITE_LOGIN_HERO_SETTING_KEY, SITE_LOGO_SETTING_KEY } from "@/lib/media/settings";

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

function validateUploadBasics(input: UploadMediaInput): void {
  if (!input.entityId.trim()) {
    throw new AppError("entityId is required", 400, "MEDIA_ENTITY_ID_REQUIRED");
  }
  if (!MEDIA_ALLOWED_MIME_TYPES.includes(input.mimeType as (typeof MEDIA_ALLOWED_MIME_TYPES)[number])) {
    throw new AppError("Unsupported image type", 400, "MEDIA_INVALID_MIME");
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > MEDIA_MAX_FILE_SIZE_BYTES) {
    throw new AppError("File is too large", 400, "MEDIA_FILE_TOO_LARGE");
  }
}

function buildStorageKey(input: UploadMediaInput): string {
  const ext = fileExtFromMime(input.mimeType);
  const stamp = Date.now();
  const token = randomUUID();
  return `${input.entityType.toLowerCase()}/${input.entityId}/${input.kind.toLowerCase()}-${stamp}-${token}.${ext}`;
}

async function deleteAssetById(assetId: string): Promise<void> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.deletedAt) return;
  const storage = getStorageProvider();
  await storage.deleteObject(asset.storageKey);
  await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: { deletedAt: new Date() },
  });
}

async function enforcePortfolioLimit(entityType: MediaEntityType, entityId: string): Promise<void> {
  const count = await prisma.mediaAsset.count({
    where: {
      entityType,
      entityId,
      kind: MediaKind.PORTFOLIO,
      deletedAt: null,
    },
  });
  if (count >= MEDIA_PORTFOLIO_LIMIT) {
    throw new AppError("Portfolio limit reached", 409, "MEDIA_PORTFOLIO_LIMIT_REACHED");
  }
}

export async function listMediaAssets(
  user: UserProfile | null,
  input: { entityType: MediaEntityType; entityId: string; kind?: MediaKind }
): Promise<MediaAssetDto[]> {
  const entityId = normalizeEntityId(input.entityId);
  await ensureCanReadMedia(user, input.entityType, entityId);

  const assets = await prisma.mediaAsset.findMany({
    where: {
      entityType: input.entityType,
      entityId,
      kind: input.kind,
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
  return assets.map(toMediaAssetDto);
}

export async function uploadMediaAsset(user: UserProfile, input: UploadMediaInput): Promise<MediaAssetDto> {
  validateUploadBasics(input);
  const entityId = normalizeEntityId(input.entityId);

  await ensureCanManageMedia(user, input.entityType, entityId, input.kind);

  if (input.kind === MediaKind.PORTFOLIO && !input.replaceAssetId) {
    await enforcePortfolioLimit(input.entityType, entityId);
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
      throw new AppError("replaceAssetId mismatch", 400, "MEDIA_REPLACE_ASSET_MISMATCH");
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

  const storage = getStorageProvider();
  const storageKey = buildStorageKey({ ...input, entityId });
  await storage.putObject({
    key: storageKey,
    bytes: input.bytes,
    contentType: input.mimeType,
  });

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
    },
  });

  if (
    input.entityType === MediaEntityType.SITE &&
    entityId === "site" &&
    input.kind === MediaKind.AVATAR
  ) {
    await prisma.appSetting.upsert({
      where: { key: SITE_LOGO_SETTING_KEY },
      update: { value: created.id },
      create: { key: SITE_LOGO_SETTING_KEY, value: created.id },
    });
  }

  if (
    input.entityType === MediaEntityType.SITE &&
    entityId === "site" &&
    input.kind === MediaKind.PORTFOLIO
  ) {
    await prisma.appSetting.upsert({
      where: { key: SITE_LOGIN_HERO_SETTING_KEY },
      update: { value: created.id },
      create: { key: SITE_LOGIN_HERO_SETTING_KEY, value: created.id },
    });
  }

  if (
    input.kind === MediaKind.AVATAR &&
    (input.entityType === MediaEntityType.MASTER || input.entityType === MediaEntityType.STUDIO)
  ) {
    await prisma.provider.update({
      where: { id: entityId },
      data: { avatarUrl: `/api/media/file/${created.id}` },
    });
  }

  return toMediaAssetDto(created);
}

export async function deleteMediaAsset(user: UserProfile, assetId: string): Promise<{ id: string }> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
  });
  if (!asset || asset.deletedAt) {
    throw new AppError("Media asset not found", 404, "MEDIA_ASSET_NOT_FOUND");
  }

  await ensureCanManageMedia(user, asset.entityType, asset.entityId, asset.kind);
  await deleteAssetById(asset.id);

  if (
    asset.entityType === MediaEntityType.SITE &&
    asset.entityId === "site" &&
    asset.kind === MediaKind.AVATAR
  ) {
    await prisma.appSetting.deleteMany({
      where: {
        key: SITE_LOGO_SETTING_KEY,
        value: asset.id,
      },
    });
  }

  if (
    asset.entityType === MediaEntityType.SITE &&
    asset.entityId === "site" &&
    asset.kind === MediaKind.PORTFOLIO
  ) {
    await prisma.appSetting.deleteMany({
      where: {
        key: SITE_LOGIN_HERO_SETTING_KEY,
        value: asset.id,
      },
    });
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
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    await prisma.provider.update({
      where: { id: asset.entityId },
      data: { avatarUrl: nextAvatar ? `/api/media/file/${nextAvatar.id}` : null },
    });
  }

  return { id: asset.id };
}

export async function getMediaFile(
  user: UserProfile | null,
  assetId: string
): Promise<MediaFileResult> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: assetId },
  });
  if (!asset || asset.deletedAt) {
    throw new AppError("Media asset not found", 404, "MEDIA_ASSET_NOT_FOUND");
  }

  await ensureCanReadMedia(user, asset.entityType, asset.entityId);

  const storage = getStorageProvider();
  const file = await storage.getObject(asset.storageKey, asset.mimeType);
  if (!file) {
    throw new AppError("Media asset not found", 404, "MEDIA_ASSET_NOT_FOUND");
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
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (avatar?.id) return `/api/media/file/${avatar.id}`;
  return input.externalUrl ?? null;
}
