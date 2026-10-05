import { z } from "zod";

export const PROVIDER_LIST_DEFAULT_LIMIT = 24;
export const PROVIDER_LIST_MAX_LIMIT = 100;

export const providerIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

/**
 * MOBILE-B3 — `{providerId}` публичных маршрутов `/api/public/providers/{key}/…`:
 * адрес профиля (`publicUsername`, регистр не важен, старый адрес тоже) или
 * CUID провайдера. Адрес — до 32 символов, CUID — 25; 64 с запасом.
 */
export const publicProviderKeyParamSchema = z.object({
  providerId: z.string().trim().min(1).max(64),
});

export const providerListQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).optional(),
});

export const emptyBodySchema = z.object({}).strict();
