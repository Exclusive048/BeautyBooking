import { AppError } from "@/lib/api/errors";
import { fail } from "@/lib/api/response";
import * as UI_TEXT from "@/lib/ui/text";

export { ACCOUNT_BLOCKED_REDIRECT_ERROR } from "./account-block-shared";

/**
 * USER-BLOCKING-01 — блокировка аккаунта администратором.
 *
 * Отметка — `UserProfile.blockedAt` (+ `blockedByUserId`, `blockedReason`);
 * ставит и снимает её только `features/admin-cabinet/users/server/block.service.ts`.
 * Действует отметка в ДВУХ местах, и оба нужны:
 *
 * 1. Чтение сессии (`loadActiveSessionUser`, `getSessionUserId`, ротация в
 *    `session.ts`) требует `blockedAt: null`. Это и гасит уже выданный
 *    access-токен — и кукой, и `Authorization: Bearer` — немедленно, не
 *    дожидаясь конца его двух часов: отзыв семей сессий в транзакции
 *    блокировки делает то же самое, но условие в чтении не зависит от того,
 *    успела ли транзакция отозвать все строки.
 * 2. Выдача сессии (`issueSession`) отказывает заблокированному — страховка
 *    под любой путь входа. Пути входа (OTP телефона и почты, VK / Яндекс /
 *    Telegram, обмен кода приложения) проверяют блокировку РАНЬШЕ, чтобы
 *    ответить своей формой — конвертом или навигацией, — а не 500.
 *
 * Отказ входа заблокированному — только ПОСЛЕ доказательства личности (код
 * принят, провайдер вернул связанную учётку): иначе любой, кто знает номер
 * или почту, узнавал бы, что аккаунт заблокирован.
 */

/**
 * Текст отказа — тот же, что `/login` показывает по `?error=account_blocked`
 * (OAuth и Telegram): один источник, `UI_TEXT.auth.loginPage.accountBlocked`.
 */
export const ACCOUNT_BLOCKED_MESSAGE = UI_TEXT.auth.loginPage.accountBlocked;

export function accountBlockedError(): AppError {
  return new AppError(ACCOUNT_BLOCKED_MESSAGE, 403, "ACCOUNT_BLOCKED");
}

/** Конверт отказа для роутов, отвечающих JSON (OTP-вход веба и приложения, обмен кода). */
export function failAccountBlocked() {
  return fail(ACCOUNT_BLOCKED_MESSAGE, 403, "ACCOUNT_BLOCKED");
}

export function isAccountBlocked(user: { blockedAt: Date | null } | null | undefined): boolean {
  return Boolean(user?.blockedAt);
}

export function isAccountBlockedError(error: unknown): boolean {
  return error instanceof AppError && error.code === "ACCOUNT_BLOCKED";
}
