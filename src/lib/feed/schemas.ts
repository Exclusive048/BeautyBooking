import { z } from "zod";
import { cityQueryParamSchema } from "@/lib/cities/city-param";

export const portfolioFeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().optional(),
  q: z.string().trim().optional(),
  categoryId: z.string().trim().optional(),
  category: z.string().trim().optional(),
  tag: z.string().trim().optional(),
  near: z.string().trim().optional(),
  masterId: z.string().trim().optional(),
  // MOBILE-B1: slug города (`GET /api/cities`) — только работы мастеров города.
  city: cityQueryParamSchema,
});

/** HOME-FEED-COLLAGE: страница ленты главной — в ГРУППАХ (плитках), не в работах. */
export const homeFeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(12),
  cursor: z.string().trim().max(200).optional(),
  // MOBILE-B1: slug города (`GET /api/cities`) — только работы мастеров города.
  city: cityQueryParamSchema,
});
