import { NextResponse } from "next/server";

/**
 * MOBILE-AUTH-A2 — возврат из системного браузера в нативное приложение.
 *
 * Вход через VK ID / Яндекс ID приложение проходит в системном браузере
 * (iOS `ASWebAuthenticationSession`, Android Custom Tabs). Кончается флоу
 * переходом на схему приложения: ОС перехватывает его и возвращает управление
 * приложению вместе с параметрами. Схема зашита в сборку приложения
 * (MasterRyadomMobile) и на сервере живёт в ОДНОЙ константе ниже.
 *
 * `nextRedirect` (`http/origin.ts`) здесь не годится намеренно: он строит
 * адрес same-origin и прогоняет путь через `sanitizeInternalPath`, то есть
 * чужую схему схлопнул бы в дефолтный путь кабинета. `NextResponse.redirect`
 * принимает любой абсолютный URL (`validateURL` — это `new URL(...)`), поэтому
 * адрес собирается здесь и только здесь, из констант: параметры — ровно
 * `code` / `linked` / `error`, и значения выбирает сервер.
 *
 * Ответ `no-store` и без Referer: в `Location` может ехать одноразовый код.
 */

export const MOBILE_APP_SCHEME = "masterryadom";
export const MOBILE_AUTH_CALLBACK_URL = `${MOBILE_APP_SCHEME}://auth/callback`;

/**
 * Исходы, которые приложение получает в `?error=`. Открытые строки контракта
 * (`MasterRyadomMobile/docs/API-CONTRACT.md`), стабильные, в нижнем регистре —
 * как ключи `OAuthStartFailure` у веба. Новый исход — новая строка в приложении.
 */
export type MobileAuthCallbackError =
  /** Неизвестный провайдер или битый `codeChallenge` на старте. */
  | "invalid_request"
  /** Провайдер выключен килсвитчем (ФЗ-199) или не сконфигурирован. */
  | "provider_unavailable"
  /** Обязательные согласия не отмечены, а вход создал бы аккаунт (RKN-FIX-01). */
  | "consent_required"
  /** link-intent неизвестен, протух, использован или выдан для другого провайдера. */
  | "intent_invalid"
  /** Прочий отказ старта (не собрался адрес авторизации, Redis). */
  | "start_failed"
  /** state/verifier флоу не сошлись или протухли (10 мин) — начать заново. */
  | "state_invalid"
  /** Пользователь отказал на странице провайдера. */
  | "access_denied"
  /** Провайдер не ответил вовремя — повторить имеет смысл. */
  | "provider_timeout"
  | "vk_already_linked"
  | "yandex_already_linked"
  /** Конфликт уникальности адреса (FIX-B5) — то же, что веб `/login?error=email_taken`. */
  | "email_taken"
  /** Всё остальное. */
  | "callback_failed";

export type MobileAuthCallbackOutcome =
  | { code: string }
  | { linked: "vk" | "yandex" }
  | { error: MobileAuthCallbackError };

export function buildMobileAuthCallbackUrl(outcome: MobileAuthCallbackOutcome): string {
  const url = new URL(MOBILE_AUTH_CALLBACK_URL);
  if ("code" in outcome) url.searchParams.set("code", outcome.code);
  else if ("linked" in outcome) url.searchParams.set("linked", outcome.linked);
  else url.searchParams.set("error", outcome.error);
  return url.toString();
}

export function mobileAuthCallbackRedirect(outcome: MobileAuthCallbackOutcome): NextResponse {
  const response = NextResponse.redirect(buildMobileAuthCallbackUrl(outcome), 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
