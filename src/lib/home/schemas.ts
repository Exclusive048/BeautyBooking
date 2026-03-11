import { z } from "zod";

export const homeFeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(24),
  cursor: z.string().trim().optional(),
  globalCategoryId: z.string().trim().optional(),
  categoryId: z.string().trim().optional(),
  tagId: z.string().trim().optional(),
});

export const homeTagsQuerySchema = z.object({
  categoryId: z.string().trim().optional(),
});
