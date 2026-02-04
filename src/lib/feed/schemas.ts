import { z } from "zod";

export const portfolioFeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().optional(),
  q: z.string().trim().optional(),
  categoryId: z.string().trim().optional(),
  category: z.string().trim().optional(),
  tag: z.string().trim().optional(),
  near: z.string().trim().optional(),
  masterId: z.string().trim().optional(),
});
