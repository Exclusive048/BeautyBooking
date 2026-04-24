import type { MediaAsset, MediaEntityType, MediaKind } from "@prisma/client";

export const MEDIA_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MEDIA_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MEDIA_PORTFOLIO_LIMIT = 20;

export type AllowedMediaMimeType = (typeof MEDIA_ALLOWED_MIME_TYPES)[number];

export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MediaAssetDto = {
  id: string;
  entityType: MediaEntityType;
  entityId: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  url: string;
  focalX: number | null;
  focalY: number | null;
  cropX: number | null;
  cropY: number | null;
  cropWidth: number | null;
  cropHeight: number | null;
  createdAt: string;
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
    focalX: asset.focalX ?? null,
    focalY: asset.focalY ?? null,
    cropX: asset.cropX ?? null,
    cropY: asset.cropY ?? null,
    cropWidth: asset.cropWidth ?? null,
    cropHeight: asset.cropHeight ?? null,
    createdAt: asset.createdAt.toISOString(),
  };
}

export function assetHasCrop(asset: Pick<MediaAssetDto, "cropX" | "cropY" | "cropWidth" | "cropHeight">): boolean {
  return (
    asset.cropX !== null &&
    asset.cropY !== null &&
    asset.cropWidth !== null &&
    asset.cropHeight !== null
  );
}
