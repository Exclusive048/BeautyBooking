import { cache } from "react";
import { emptyOnRefusal } from "@/features/public-profile/master/server/refusal";
import type { ProviderProfileDto } from "@/lib/providers/dto";
import { getProviderProfile } from "@/lib/providers/usecases";

/**
 * Профиль мастера для секций публичной страницы — вызов сервиса, а не
 * HTTP-запрос к `/api/providers/{id}` (29.09 доработки · 13). Не найден или не
 * опубликован — `null`.
 */
export const getProvider = cache(async (providerId: string): Promise<ProviderProfileDto | null> => {
  if (!providerId) return null;
  return emptyOnRefusal<ProviderProfileDto | null>(() => getProviderProfile(providerId), null);
});
