import { z } from "zod";

export const catalogEntityTypeSchema = z.enum(["all", "master", "studio"]);
export type CatalogEntityType = z.infer<typeof catalogEntityTypeSchema>;

export const catalogViewSchema = z.enum(["list", "map"]);
export type CatalogView = z.infer<typeof catalogViewSchema>;

export const catalogSmartTagPresetSchema = z.enum(["rush", "relax", "design", "safe", "silent"]);
export type CatalogSmartTagPreset = z.infer<typeof catalogSmartTagPresetSchema>;

export const catalogSortSchema = z.enum([
  "relevance",
  "rating",
  "price-asc",
  "price-desc",
  "distance",
  "popular",
]);
export type CatalogSort = z.infer<typeof catalogSortSchema>;

export const catalogSearchQuerySchema = z.object({
  serviceQuery: z.string().trim().optional(),
  district: z.string().trim().optional(),
  date: z.string().trim().optional(),
  priceMin: z.coerce.number().int().min(0).optional(),
  priceMax: z.coerce.number().int().min(0).optional(),
  availableToday: z.coerce.boolean().optional(),
  hot: z.coerce.boolean().optional(),
  globalCategoryId: z.string().trim().min(1).optional(),
  includeChildCategories: z.coerce.boolean().default(true),
  ratingMin: z.coerce.number().min(0).max(5).optional(),
  smartTag: catalogSmartTagPresetSchema.optional(),
  entityType: catalogEntityTypeSchema.optional(),
  modelOffers: z.coerce.boolean().optional(),
  view: catalogViewSchema.optional(),
  sort: catalogSortSchema.optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  bbox: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(40).default(20),
  cursor: z.string().trim().min(1).optional(),
  // Numbered pagination — when present, takes precedence over `cursor` and is
  // translated to (page - 1) * limit offset by the service. `cursor` continues
  // to power time-search-mode and any client that hasn't migrated.
  page: z.coerce.number().int().min(1).optional(),
});

export type CatalogSearchQuery = z.infer<typeof catalogSearchQuerySchema>;

