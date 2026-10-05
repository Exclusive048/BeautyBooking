import { z } from "zod";

/**
 * MOBILE-POLISH — формат настроек входа для App Review: общий для схемы env
 * (`env.ts`) и рантайм-проверки (`app-review-login.ts`). Отдельный чистый
 * модуль: тесты, подменяющие `@/lib/env`, не теряют проверку формата.
 */

/** Код входа для App Review — ровно 6 цифр, как обычный код из письма. */
export const APP_REVIEW_LOGIN_CODE_PATTERN = /^\d{6}$/;

/** Похоже ли значение на адрес почты (та же проверка, что у формы входа). */
export function isLoginEmail(value: string): boolean {
  return z.string().email().safeParse(value).success;
}
