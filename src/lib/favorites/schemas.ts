import { z } from "zod";

export const favoriteToggleSchema = z.object({
  providerId: z.string().trim().min(1).max(40),
});

export type FavoriteToggleInput = z.infer<typeof favoriteToggleSchema>;
