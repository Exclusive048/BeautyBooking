import { z } from "zod";

export const clientCardPatchSchema = z.object({
  notes: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1)).max(9).optional(),
});
