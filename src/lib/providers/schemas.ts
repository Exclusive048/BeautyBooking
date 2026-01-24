import { z } from "zod";

export const providerIdParamSchema = z.object({
  id: z.string().min(1, "Provider id is required"),
});

export const emptyBodySchema = z.object({}).strict();
