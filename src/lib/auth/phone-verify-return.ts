import "server-only";

import { cookies } from "next/headers";
import type { PhoneProofProvider, ProviderPhoneOutcome } from "@/lib/auth/phone-provider-proof";
import { isProduction } from "@/lib/env";
import { sanitizeInternalPath } from "@/lib/http/safe-redirect";

/**
 * PHONE-OAUTH-PROOF-01 — куда вернуть пользователя после «Подтвердить номер
 * через ВКонтакте / Яндекс ID».
 *
 * Кнопка стоит в кабинете, а колбэк OAuth по умолчанию ведёт в кабинет по роли —
 * человек терял страницу, с которой начал, и не видел итога. Стартовая нога
 * запоминает страницу-источник (только внутренний путь, `sanitizeInternalPath`)
 * в cookie на время раунд-трипа, колбэк забирает её ОДИН раз и дописывает итог
 * `?phoneVerify=<исход>&via=<провайдер>` — его показывает `PhoneVerifyNotice`.
 * Значение не несёт прав: худшее, что даёт подмена, — возврат на другую
 * страницу этого же сайта.
 */
export const PHONE_VERIFY_RETURN_COOKIE = "mr_phone_verify_return";
const PHONE_VERIFY_RETURN_TTL_SECONDS = 10 * 60;
const DEFAULT_RETURN_PATH = "/cabinet/profile";

/** Query-флаг стартовой ноги: «этот вход — подтверждение телефона». */
export const PHONE_VERIFY_START_PARAM = "verifyPhone";

export async function rememberPhoneVerifyReturn(path: string): Promise<void> {
  const store = await cookies();
  store.set(PHONE_VERIFY_RETURN_COOKIE, sanitizeInternalPath(path, DEFAULT_RETURN_PATH), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: PHONE_VERIFY_RETURN_TTL_SECONDS,
  });
}

/** Одноразово: прочитать и сразу погасить. `null` — вход был не из кнопки. */
export async function takePhoneVerifyReturn(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(PHONE_VERIFY_RETURN_COOKIE)?.value;
  if (!raw) return null;
  store.set(PHONE_VERIFY_RETURN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 0,
  });
  return sanitizeInternalPath(raw, DEFAULT_RETURN_PATH);
}

export type PhoneVerifyResult = ProviderPhoneOutcome | "error";

export function phoneVerifyResultPath(
  path: string,
  provider: PhoneProofProvider,
  outcome: PhoneVerifyResult,
): string {
  const url = new URL(path, "http://internal.invalid");
  url.searchParams.set("phoneVerify", outcome);
  url.searchParams.set("via", provider);
  return `${url.pathname}${url.search}`;
}
