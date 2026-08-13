import { AppError, toAppError } from "@/lib/api/errors";
import { nextRedirect } from "@/lib/http/origin";
import { getRequestId, logError } from "@/lib/logging/logger";
import { scrubRecord } from "@/lib/observability/scrub";

/**
 * FIX-B14 · AUTH-RESPONSE-COHERENCE — стартовая нога OAuth отвечает НАВИГАЦИЕЙ.
 *
 * `GET /api/auth/vk/start` — не «эндпоинт API», а адрес, по которому браузер
 * уходит с `/login` по клику «войти через VK» (`<a href>` в кнопке провайдера,
 * `window.location.href` в кабинетном линковании). Значит любой её исход, чем
 * бы он ни был вызван, заканчивается в браузере, которому надо где-то
 * оказаться. JSON-конверт там — тупик независимо от причины: пользователь
 * видит `{"ok":false,…}` вместо сайта, и кнопки «назад к входу» у него нет.
 *
 * 🔴 Здесь решение владельца отличается от колбэка, и различие существенно.
 * На колбэке (`oauth-callback-error.ts`, FIX-B13) редиректом отвечают только
 * отказы, у которых есть осмысленное продолжение, а «повторять нечего» честно
 * остаётся JSON'ом — там это отражает суть отказа. На СТАРТЕ такого выбора нет:
 * даже отказ без продолжения обязан кончиться страницей, потому что страница —
 * это единственная форма, которую браузер умеет показать. Поэтому
 * классификация здесь решает НЕ «редирект или JSON» (редирект всегда), а
 * только — какое сообщение показать.
 *
 * Три исхода, и больше их быть не должно без явного решения:
 *
 *   - `provider_unavailable` — провайдер выключен килсвитчем (FZ-199,
 *     `isVkAuthEnabled` / `isYandexAuthEnabled`) либо не сконфигурирован
 *     (`*_CLIENT_ID_MISSING` и родня). Повторять бессмысленно, но на `/login`
 *     есть другие способы входа — туда и отправляем;
 *   - `consent_required` — обязательные согласия не отмечены (RKN-FIX-01).
 *     У этого исхода назначение очевидно: обратно на `/login`, где галочки и
 *     живут. Ровно поэтому исключений из «всё редиректит» нет;
 *   - `start_failed` — всё остальное (не собрался authorize-URL, не записались
 *     cookie). Причина внутренняя.
 */
export type OAuthStartFailure = "provider_unavailable" | "consent_required" | "start_failed";

/**
 * Классификация ИСКЛЮЧЕНИЯ, брошенного телом старта. Согласия и килсвитч
 * проверяются до `try` и своих исключений не бросают — их исход вызывающий
 * называет сам.
 */
export function classifyOAuthStartFailure(
  error: unknown,
  notConfiguredCodes: ReadonlySet<string>,
): OAuthStartFailure {
  const appError = error instanceof AppError ? error : toAppError(error);
  return notConfiguredCodes.has(appError.code) ? "provider_unavailable" : "start_failed";
}

/**
 * Диагностика уезжает в лог **со скрабом**, а не в ответ.
 *
 * SECURITY-EXPOSURE-AUDIT-01 · Y9 снял `AppError.details` с колбэков ровно
 * потому, что провайдерские библиотеки прикладывают туда сырой ответ OAuth.
 * Стартовая нога обмена токенами не делает, но живёт в том же модуле и на том
 * же классе ошибок (`requireVkRedirectUri` бросает тот же `AppError`), поэтому
 * граница у неё та же: наружу — курируемый текст, в лог — скрабленный вид.
 */
export function logOAuthStartFailure(req: Request, error: unknown): void {
  const appError = error instanceof AppError ? error : toAppError(error);
  logError("OAuth start failed", {
    requestId: getRequestId(req),
    code: appError.code,
    status: appError.status,
    details:
      appError.details && typeof appError.details === "object"
        ? scrubRecord(appError.details as Record<string, unknown>)
        : undefined,
  });
}

/**
 * Единственная точка, где исход превращается в адрес `/login`. Ключ запроса и
 * есть имя исхода — маппинг в текст живёт в `login-client.tsx` и опирается на
 * этот же союз типов, поэтому новый исход без строки в UI не проедет мимо
 * компилятора.
 */
export function oauthStartLoginRedirect(req: Request, failure: OAuthStartFailure) {
  return nextRedirect(req, `/login?error=${failure}`);
}

/** Лог + редирект одним вызовом — форма, в которой это нужно в `catch`. */
export function failOAuthStart(
  req: Request,
  error: unknown,
  notConfiguredCodes: ReadonlySet<string>,
) {
  logOAuthStartFailure(req, error);
  return oauthStartLoginRedirect(req, classifyOAuthStartFailure(error, notConfiguredCodes));
}
