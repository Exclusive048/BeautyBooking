import { z } from "zod";

export const notificationsQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

