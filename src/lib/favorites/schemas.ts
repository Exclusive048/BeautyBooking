import { z } from "zod";

// Accept EITHER the internal providerId (authed cabinet / public-profile
// surfaces that already resolved it server-side) OR the public
// providerUsername (catalog cards — QA-103, the public search no longer emits
// the CUID). At least one is required.
export const favoriteToggleSchema = z
  .object({
    providerId: z.string().trim().min(1).max(40).optional(),
    providerUsername: z.string().trim().min(1).max(64).optional(),
  })
  .refine((v) => Boolean(v.providerId) || Boolean(v.providerUsername), {
    message: "providerId or providerUsername is required",
  });

export type FavoriteToggleInput = z.infer<typeof favoriteToggleSchema>;
