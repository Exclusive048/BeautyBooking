import { MediaEntityType, MediaKind } from "@prisma/client";
import { z } from "zod";

export const mediaListQuerySchema = z.object({
  entityType: z.nativeEnum(MediaEntityType),
  entityId: z.string().trim().min(1, "entityId is required"),
  kind: z.nativeEnum(MediaKind).optional(),
});

export const mediaUploadBodySchema = z.object({
  entityType: z.nativeEnum(MediaEntityType),
  entityId: z.string().trim().min(1, "entityId is required"),
  kind: z.nativeEnum(MediaKind),
  replaceAssetId: z.string().trim().min(1).optional(),
});

export const mediaAssetIdParamSchema = z.object({
  id: z.string().trim().min(1),
});
