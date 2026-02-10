import { z } from "zod";

export const catalogEntityTypeSchema = z.enum(["all", "master", "studio"]);
export type CatalogEntityType = z.infer<typeof catalogEntityTypeSchema>;

export const catalogViewSchema = z.enum(["list", "map"]);
export type CatalogView = z.infer<typeof catalogViewSchema>;

export const catalogSmartTagPresetSchema = z.enum(["rush", "relax", "design", "safe", "silent"]);
export type CatalogSmartTagPreset = z.infer<typeof catalogSmartTagPresetSchema>;

export const catalogSearchQuerySchema = z.object({
  serviceQuery: z.string().trim().optional(),
  district: z.string().trim().optional(),
  date: z.string().trim().optional(),
  priceMin: z.coerce.number().int().min(0).optional(),
  priceMax: z.coerce.number().int().min(0).optional(),
  availableToday: z.coerce.boolean().optional(),
  hot: z.coerce.boolean().optional(),
  ratingMin: z.coerce.number().min(0).max(5).optional(),
  smartTag: catalogSmartTagPresetSchema.optional(),
  entityType: catalogEntityTypeSchema.optional(),
  view: catalogViewSchema.optional(),
  limit: z.coerce.number().int().min(1).max(40).default(20),
  cursor: z.coerce.number().int().min(0).optional(),
});

export type CatalogSearchQuery = z.infer<typeof catalogSearchQuerySchema>;

