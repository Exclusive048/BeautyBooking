import { AppError, toAppError } from "@/lib/api/errors";
import { fail } from "@/lib/api/response";
import { nextRedirect } from "@/lib/http/origin";
import { getRequestId, logError } from "@/lib/logging/logger";
import { scrubRecord } from "@/lib/observability/scrub";

/**
 * SECURITY-EXPOSURE-AUDIT-01 · Y9 — OAuth callback error responses must NOT
 * carry `AppError.details`.
 *
 * The VK / Yandex provider libraries attach the raw upstream OAuth response as
 * `details` (see `src/lib/{vk,yandex}/oauth.ts`). On a partial-token response
 * (`access_token` present, `refresh_token` missing → "incomplete") or a
 * profile-error response, that blob can contain a **real access_token /
 * refresh_token / id_token or the user's profile data**. The callbacks' outer
 * catch previously did `fail(msg, status, code, appError.details)`, sending it
 * straight to the browser.
 *
 * This helper is the single place all three callbacks (auth/vk, auth/yandex,
 * integrations/vk) route their catch through: it logs a **scrubbed** view for
 * server-side diagnostics (tokens/PII redacted by `scrubRecord`) and returns
 * only the curated message + code — never the raw payload.
 */
/**
 * FIX-B13 — «повторять есть что» как СВОЙСТВО отказа, а не как имя кода.
 *
 * Дедлайн обменов с провайдером (RES-09, 10 с) отклоняет `fetch` нативным
 * `DOMException` с именем `TimeoutError`, и он не несёт ни `code`, ни `status` —
 * то есть `toAppError` сводит его к общему `INTERNAL_ERROR` 500, где таймаут
 * неотличим от настоящего бага. Поэтому классифицировать надо ИСХОДНУЮ ошибку,
 * до нормализации: после неё признак уже потерян.
 *
 * 🔴 Границу держим узкой намеренно. Таймаут Redis (`REDIS_COMMAND_TIMEOUT`,
 * `withRedisCommandTimeout`) тоже достижим в колбэке и формально тоже
 * «retryable», но сюда НЕ входит: это медленно у НАС, а сообщение обещает
 * пользователю, что медленно было у провайдера. Соврать про причину хуже, чем
 * отдать общий отказ, — у такого случая должен быть свой текст и своё решение.
 */
export function isRetryableOAuthCallbackFailure(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

export function failOAuthCallback(req: Request, error: unknown) {
  const appError = error instanceof AppError ? error : toAppError(error);
  logError("OAuth callback failed", {
    requestId: getRequestId(req),
    code: appError.code,
    status: appError.status,
    details:
      appError.details && typeof appError.details === "object"
        ? scrubRecord(appError.details as Record<string, unknown>)
        : undefined,
  });

  // FIX-B5: конфликт уникальности — единственный отказ этого хелпера, у
  // которого есть ОСМЫСЛЕННОЕ продолжение для пользователя, поэтому он один и
  // возвращается редиректом.
  //
  // Контекст: пользователь в этот момент внутри редиректа провайдера. JSON-тело
  // здесь — это не «ответ API», а тупик: браузер показывает сырой конверт
  // вместо сайта, и вернуться некуда. Для остальных отказов (битый токен,
  // отказ провайдера) сохранена прежняя форма — они означают «повторить нечего»,
  // и подменять их редиректом значило бы прятать сбой.
  //
  // Сегодня ветка недостижима: `email` пишется НЕподтверждённым, а частичный
  // уникальный индекс (EMAIL-ADDRESS-OCCUPATION) ограничивает только
  // подтверждённые строки. Она заведена ЗАРАНЕЕ — ровно потому, что станет
  // достижимой в тот день, когда кто-нибудь решит проставлять здесь
  // `emailVerifiedAt` (инв. #41 говорит, что решать это нельзя молча).
  if (appError.code === "ALREADY_EXISTS" || appError.code === "EMAIL_ALREADY_USED") {
    return nextRedirect(req, "/login?error=email_taken");
  }

  // FIX-B13: второй — и пока последний — отказ с осмысленным продолжением.
  // Проверяется ИСХОДНАЯ ошибка, а не `appError.code`: к этому моменту таймаут
  // уже сведён к `INTERNAL_ERROR` (см. `isRetryableOAuthCallbackFailure`).
  if (isRetryableOAuthCallbackFailure(error)) {
    return nextRedirect(req, "/login?error=provider_timeout");
  }

  return fail(appError.message, appError.status, appError.code);
}
