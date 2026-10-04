import "server-only";

import { env } from "@/lib/env";
import { APP_REVIEW_LOGIN_CODE_PATTERN, isLoginEmail } from "@/lib/auth/app-review-login-format";
import { timingSafeStringEqual } from "@/lib/auth/constant-time";
import { logInfo } from "@/lib/logging/logger";

/**
 * MOBILE-POLISH — вход для проверяющего App Store / Google Play.
 *
 * Проверяющему нужен рабочий аккаунт, а письмо с кодом ему не прочитать.
 * Поэтому для ОДНОГО адреса (`APP_REVIEW_LOGIN_EMAIL`) вход по почте работает
 * с постоянным кодом (`APP_REVIEW_LOGIN_CODE`, 6 цифр):
 *   - `POST /api/auth/otp/email/request` — тот же ответ `200 {}`, но письмо не
 *     отправляется и код в базе не создаётся;
 *   - вход (`verifyEmailOtpLogin` — общий для сайта и приложения) принимает
 *     этот код, сравнение — за постоянное время; неверный код — обычный отказ
 *     `CODE_NOT_FOUND` со счётчиком неверных попыток и блокировкой.
 * Все лимиты (запрос кода, блокировка входа) действуют как для всех. Включено,
 * только когда заданы оба значения и оба верны; иначе — выключено целиком.
 * Каждый запрос и вход пишет строку в лог БЕЗ адреса и кода.
 */

type AppReviewLoginSource = {
  APP_REVIEW_LOGIN_EMAIL?: string | null;
  APP_REVIEW_LOGIN_CODE?: string | null;
};

export type AppReviewLoginConfig = { email: string; code: string };

/**
 * Настройка из env, проверенная ещё раз: в dev и тестах env отдаётся без
 * парса (`env.ts`), и непохожее значение не должно включать вход.
 */
export function readAppReviewLoginConfig(
  source: AppReviewLoginSource = env,
): AppReviewLoginConfig | null {
  const email = source.APP_REVIEW_LOGIN_EMAIL?.trim().toLowerCase() ?? "";
  const code = source.APP_REVIEW_LOGIN_CODE?.trim() ?? "";
  if (!email || !code) return null;
  if (!isLoginEmail(email) || !APP_REVIEW_LOGIN_CODE_PATTERN.test(code)) return null;
  return { email, code };
}

/** Это адрес входа для App Review (адрес — уже в нижнем регистре). */
export function isAppReviewLoginEmail(
  normalizedEmail: string,
  config: AppReviewLoginConfig | null = readAppReviewLoginConfig(),
): boolean {
  return config !== null && config.email === normalizedEmail;
}

/** Подходит ли код для адреса App Review. Для любого другого адреса — нет. */
export function matchesAppReviewLoginCode(
  normalizedEmail: string,
  code: string,
  config: AppReviewLoginConfig | null = readAppReviewLoginConfig(),
): boolean {
  if (!config || config.email !== normalizedEmail) return false;
  return timingSafeStringEqual(code.trim(), config.code);
}

/** Строка аудита: этап и исход, без адреса, кода и IP. */
export function logAppReviewLogin(stage: "request" | "verify", outcome: "accepted" | "rejected"): void {
  logInfo("auth.app-review-login", { stage, outcome });
}
