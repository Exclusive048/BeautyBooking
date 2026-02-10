import { z } from "zod";
import { catalogEntityTypeSchema, catalogSmartTagPresetSchema } from "@/lib/catalog/schemas";

export const availabilitySearchQuerySchema = z.object({
  date: z.string().trim().optional(),
  timeFrom: z.string().trim().optional(),
  timeTo: z.string().trim().optional(),
  serviceId: z.string().trim().optional(),
  district: z.string().trim().optional(),
  priceMin: z.coerce.number().int().min(0).optional(),
  priceMax: z.coerce.number().int().min(0).optional(),
  availableToday: z.coerce.boolean().optional(),
  hot: z.coerce.boolean().optional(),
  ratingMin: z.coerce.number().min(0).max(5).optional(),
  smartTag: catalogSmartTagPresetSchema.optional(),
  entityType: catalogEntityTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(60).default(30),
});

export type AvailabilitySearchQuery = z.infer<typeof availabilitySearchQuerySchema>;
