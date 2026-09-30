import { z } from "zod";

export const PROVIDER_LIST_DEFAULT_LIMIT = 24;
export const PROVIDER_LIST_MAX_LIMIT = 100;

export const providerIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const providerListQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
});

export const emptyBodySchema = z.object({}).strict();
