/**
 * CSRF-CONTENT-TYPE-LAYER (2026-10-30) — третий слой CSRF: JSON-тело
 * принимается только с `Content-Type: application/json`.
 *
 * Слои по порядку:
 *   1. `SameSite=Lax` у сессионных кук — межсайтовый POST уходит без них.
 *   2. `shouldRejectCrossSiteMutation` в `src/proxy.ts` (SEC-08) — мутация с
 *      `Sec-Fetch-Site: cross-site | same-site` или чужим `Origin` → 403.
 *      Запрос БЕЗ обоих заголовков пропускается намеренно (вебхуки, cron,
 *      старые клиенты).
 *   3. Этот модуль — на случай, когда первые два не сработали (браузер без
 *      `Sec-Fetch-*` и `Origin`, поддомен с куками, баг в прокси).
 *
 * Почему именно тип содержимого. Браузер отправляет межсайтово БЕЗ preflight
 * только «простые» запросы, а у них тип — `text/plain`,
 * `application/x-www-form-urlencoded` или `multipart/form-data`. `req.json()`
 * на тип не смотрит, поэтому `<form enctype="text/plain">` (или `fetch` с
 * `mode: "no-cors"`) доставлял обработчику валидный JSON. Тип
 * `application/json` чужая страница поставить не может, не вызвав preflight, а
 * его CORS не пропустит. Значит, требование типа делает подмену JSON-тела
 * простым запросом невозможной.
 *
 * Исключение — `Authorization: Bearer` (приложение): чужая страница поставить
 * такой заголовок тоже не может без preflight, а при заявленном Bearer сессию
 * решает заголовок, а не кука (`auth/bearer.ts`), — подделывать нечего.
 *
 * Где действует: `parseBody` (`lib/validation`) — общий разбор JSON-тел, и
 * `nonJsonBodyRefusal` (`lib/api/json-body-refusal.ts`) у роутов, читающих тело
 * сами. Кто читает тело ВНЕ этих двух и почему — единственный реестр
 * `REQUEST_BODY_READERS` (`lib/http/request-body-readers.ts`).
 *
 * Модуль зависит только от `auth/bearer.ts` (тоже без импортов): решение
 * чистое, обёртки с `AppError` и ответом живут у потребителей.
 */

import { isBearerAuthorization } from "@/lib/auth/bearer";

/** Текст отказа. Действия у человека нет — устаревшая вкладка или чужой клиент. */
export const NON_JSON_BODY_MESSAGE = "Не удалось отправить данные. Обновите страницу и попробуйте ещё раз.";
export const NON_JSON_BODY_STATUS = 415;
export const NON_JSON_BODY_CODE = "UNSUPPORTED_MEDIA_TYPE" as const;

/**
 * `application/json` либо структурированный суффикс `application/*+json`
 * (RFC 6839, например `application/merge-patch+json`), с параметрами или без.
 * Сравнивается только медиатип до `;`, без учёта регистра и пробелов —
 * `includes("json")` пропустил бы `text/plain; x=json`.
 */
export function isJsonContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mediaType === "application/json") return true;
  return /^application\/[a-z0-9!#$&^_.-]+\+json$/.test(mediaType);
}

type HeaderSource = { get(name: string): string | null };

/**
 * Отказать ли JSON-телу этого запроса. `true` — тип не JSON и запрос не от
 * приложения (не Bearer).
 */
export function shouldRejectNonJsonBody(headers: HeaderSource): boolean {
  if (isBearerAuthorization(headers.get("authorization"))) return false;
  return !isJsonContentType(headers.get("content-type"));
}
