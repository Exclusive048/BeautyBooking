import type { MediaAsset, MediaEntityType, MediaKind } from "@prisma/client";

export const MEDIA_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MEDIA_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MEDIA_PORTFOLIO_LIMIT = 20;

export type AllowedMediaMimeType = (typeof MEDIA_ALLOWED_MIME_TYPES)[number];

export type MediaAssetDto = {
  id: string;
  entityType: MediaEntityType;
  entityId: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  url: string;
  createdAt: string;
  visualIndexed: boolean;
  visualCategory: string | null;
};

export function toMediaAssetDto(asset: MediaAsset): MediaAssetDto {
  return {
    id: asset.id,
    entityType: asset.entityType,
    entityId: asset.entityId,
    kind: asset.kind,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    originalFilename: asset.originalFilename,
    url: `/api/media/file/${asset.id}`,
    createdAt: asset.createdAt.toISOString(),
    visualIndexed: asset.visualIndexed,
    visualCategory: asset.visualCategory ?? null,
  };
}
