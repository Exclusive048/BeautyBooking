"use client";

import { useCallback } from "react";
import useSWR, { useSWRConfig } from "swr";
import { usePathname } from "next/navigation";
import { ApiClientError, fetchJsonWithAuth } from "@/lib/http/client";
import type { MeIdentity } from "@/lib/users/me";

export type MeUser = MeIdentity;

const AUTH_PAGES = new Set(["/login", "/logout"]);

/** Ключ SWR, под которым живёт ответ `/api/me` (роли, аватар, имя). */
export const ME_SWR_KEY = "/api/me";

/**
 * SESSION-PWA-GUEST-FLASH (2026-10-01) — «гость» только по ответу сервера.
 *
 * Раньше любой сбой чтения (обрыв мобильной сети в момент, когда приложение
 * возвращается из фона; 503 «идут работы» при автодеплое; таймаут) превращался
 * в `null`, SWR сохранял его как данные, и шапка с нижней навигацией рисовали
 * гостя с кнопкой «Войти», хотя сессия на сервере жива. Человек перезаходил —
 * в PWA на телефоне это выглядело как «часто выкидывает из аккаунта».
 *
 * Теперь: ответ `{ user: null }` (сервер не узнал сессию) и 401 после
 * неудачного обновления — гость; любая другая ошибка бросается, а SWR при
 * ошибке оставляет прежние данные и сам повторяет запрос.
 */
export async function meFetcher(url: string): Promise<{ user: MeUser | null }> {
  try {
    return await fetchJsonWithAuth<{ user: MeUser | null }>(url, { cache: "no-store" });
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return { user: null };
    throw error;
  }
}

export function useMe() {
  const pathname = usePathname();
  // Don't poll /api/me on auth pages — the user is not logged in, every 401 response
  // triggers a re-render in layout components which can disrupt the OTP flow.
  const key = AUTH_PAGES.has(pathname) ? null : ME_SWR_KEY;

  const { data, error, isLoading } = useSWR<{ user: MeUser | null }>(key, meFetcher, {
    revalidateOnFocus: false,
    // Возврат приложения из фона и восстановление сети перечитывают личность.
    revalidateOnReconnect: true,
    dedupingInterval: 30_000,
  });

  return {
    user: data?.user ?? null,
    // Первое чтение не удалось — личность неизвестна, а не «гость»: кнопка
    // «Войти» не показывается, пока SWR не повторит запрос.
    isLoading: isLoading || (Boolean(error) && data === undefined),
    isError: Boolean(error),
  };
}

/**
 * INVITE-ROLE-REFRESH — перечитать `/api/me` после действия, которое меняет
 * роли (принятие приглашения в студию). Нижняя навигация держит ответ 30 с и
 * на фокус не перечитывает, поэтому без явного сброса «Стать мастером» висит.
 */
export function useRevalidateMe(): () => Promise<unknown> {
  const { mutate } = useSWRConfig();
  return useCallback(() => mutate(ME_SWR_KEY), [mutate]);
}
