import { z } from "zod";
import { cityQueryParamSchema } from "@/lib/cities/city-param";

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
  // CATALOG-DATE-TIME-FILTER: время «когда» — часы салона `HH:MM`, `[from, to)`.
  timeFrom: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  timeTo: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
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
  // CATALOG-SORT-DISTANCE: точка пользователя для «По расстоянию» и «N км».
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  bbox: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(40).default(20),
  cursor: z.string().trim().min(1).optional(),
  // Numbered pagination — when present, takes precedence over `cursor` and is
  // translated to (page - 1) * limit offset by the service. `cursor` continues
  // to power time-search-mode and any client that hasn't migrated.
  page: z.coerce.number().int().min(1).optional(),
  // MOBILE-B1: slug города (`GET /api/cities`), главнее куки `mr-city-slug`.
  city: cityQueryParamSchema,
});

export type CatalogSearchQuery = z.infer<typeof catalogSearchQuerySchema>;

