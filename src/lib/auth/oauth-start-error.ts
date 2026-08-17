import { NextResponse } from "next/server";

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

declare const OAUTH_START_NAVIGATION: unique symbol;

/**
 * FIX-C6 — ответ стартовой ноги, который МОЖЕТ быть только навигацией.
 *
 * Прежде это держал детектор `ENVELOPE_CALL`: он обходил стартовые ноги и
 * требовал, чтобы в тексте файла не встретилось возврата конвертов проекта.
 * Обходилось это тем же приёмом, что и остальные четыре сторожа кампании, —
 * собрать значение заранее: конверт присваивается переменной на одной строке,
 * а `return` этой переменной стоит на другой, и детектору не видно ни того, ни
 * другого.
 *
 * Плюс переносом вызова на две строки (детектор построчный) и переименованием
 * при импорте. Теперь исход объявлен типом: `NextResponse.json(...)` бренда не
 * несёт, поэтому вернуть конверт из ноги нельзя ни одной из этих форм —
 * промежуточная переменная тип не стирает.
 *
 * Произвести значение могут только две функции ниже, и обе делают редирект.
 */
export type OAuthStartNavigation = Response & {
  readonly [OAUTH_START_NAVIGATION]: true;
};

/**
 * Успешный исход: уход к провайдеру. Адрес внешний и построен нами
 * (`buildVkAuthorizeUrl` / `buildYandexAuthorizeUrl`), поэтому проверка
 * same-origin здесь была бы неверна — это единственная причина, по которой у
 * успеха свой производитель, а не общий с внутренней навигацией.
 */
export function oauthStartProviderRedirect(authorizeUrl: string): OAuthStartNavigation {
  return NextResponse.redirect(authorizeUrl) as unknown as OAuthStartNavigation;
}

/**
 * Внутренняя навигация стартовой ноги: обратно на `/login` либо на поверхность
 * подключения в кабинете. Адрес прогоняется через `nextRedirect`
 * (`sanitizeInternalPath` — враждебное значение схлопывается в дефолт).
 */
export function oauthStartInternalRedirect(
  req: Request,
  targetPath: string,
): OAuthStartNavigation {
  return nextRedirect(req, targetPath) as unknown as OAuthStartNavigation;
}

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
export function oauthStartLoginRedirect(
  req: Request,
  failure: OAuthStartFailure,
): OAuthStartNavigation {
  return oauthStartInternalRedirect(req, `/login?error=${failure}`);
}

/**
 * FIX-D1 — возврат на КАБИНЕТНУЮ поверхность, с которой ушёл браузер.
 *
 * Механизм построил FIX-B14 для интеграционной ноги и оставил жить внутри её
 * файла. Оказалось, что кнопка есть и во втором кабинете, а адресат отказа —
 * нет: клиентский профиль зовёт **auth**-ногу (`/api/auth/vk/start`, потому что
 * для клиента это связывание аккаунта, а не подключение уведомлений провайдера),
 * и её отказ уходил на `/login?error=…`. То есть уже вошедшего пользователя
 * отправляли на страницу входа — тупик хуже, чем отсутствие сообщения
 * (SMOKE-02 · Ф-1: параметр не снимался, потому что его никто не ставил).
 *
 * Поэтому вывод адреса переехал сюда и параметризован ключом: `/login` остаётся
 * верным адресом там, где браузер оттуда и пришёл, а кабинет получает свой
 * возврат. Враждебный `Referer` схлопывается в дефолт внутри `nextRedirect`
 * (`sanitizeInternalPath`).
 */
export function oauthStartCabinetRedirect(
  req: Request,
  failure: OAuthStartFailure,
  queryKey: string,
): OAuthStartNavigation {
  const path = cabinetRefererPath(req);
  const separator = path.includes("?") ? "&" : "?";
  return oauthStartInternalRedirect(req, `${path}${separator}${queryKey}=${failure}`);
}

const DEFAULT_CABINET_SURFACE = "/cabinet/profile";

export function cabinetRefererPath(req: Request): string {
  const referer = req.headers.get("referer");
  if (!referer) return DEFAULT_CABINET_SURFACE;
  try {
    const url = new URL(referer);
    return `${url.pathname}${url.search}`;
  } catch {
    return DEFAULT_CABINET_SURFACE;
  }
}

/**
 * Пришёл ли браузер с кабинетной страницы. Определяет, какой адрес отказа
 * верен: `/login` для входа, страница-источник для кабинета.
 *
 * ⚠️ Судим по `Referer`, и это осознанно слабый признак — он может отсутствовать
 * (тогда `/login`, прежнее поведение) и его нельзя доверять как авторизации. Он
 * и не используется как авторизация: это выбор МЕСТА показа сообщения, а адрес
 * всё равно прогоняется через `sanitizeInternalPath`.
 */
export function isCabinetReferer(req: Request): boolean {
  const referer = req.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).pathname.startsWith("/cabinet");
  } catch {
    return false;
  }
}

/** Лог + редирект одним вызовом — форма, в которой это нужно в `catch`. */
export function failOAuthStart(
  req: Request,
  error: unknown,
  notConfiguredCodes: ReadonlySet<string>,
): OAuthStartNavigation {
  logOAuthStartFailure(req, error);
  return oauthStartLoginRedirect(req, classifyOAuthStartFailure(error, notConfiguredCodes));
}
