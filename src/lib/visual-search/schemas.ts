import { z } from "zod";

export const visualSearchReindexSchema = z.object({
  categorySlug: z.string().trim().min(1).optional(),
  promptVersion: z.string().trim().min(1).optional(),
});

export const visualSearchImageSchema = z.object({
  image: z.custom<File>((value) => value instanceof File, "Image is required"),
});
