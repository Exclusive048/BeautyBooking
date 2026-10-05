import { z } from "zod";

/**
 * MOBILE-B1 — параметр `?city=<slug>` публичных эндпоинтов, зависящих от
 * города. Модуль client-safe (только zod): схема входит в
 * `catalog/schemas.ts`, который импортируют и клиентские компоненты. Резолв
 * slug → город и правила отказа — `server-city.ts` (`resolveCityParam`).
 *
 * Пустой `city=` — как отсутствующий параметр.
 */
export const CITY_QUERY_PARAM = "city";

export const cityQueryParamSchema = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => (value ? value : undefined));
