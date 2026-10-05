/**
 * MOBILE-AUTH-A — разбор `Authorization: Bearer <access JWT>`.
 *
 * Нативное приложение кук не держит: access-токен едет в заголовке, и сессию
 * читают ТЕ ЖЕ две точки, что и куку (`getAccessSessionPayload` /
 * `getAccessTokenFromRequest` в `session.ts`), с той же проверкой — тип
 * токена, подпись, срок, живая семья (`loadActiveSessionUser`).
 *
 * Правило «заголовок главнее куки» действует по СХЕМЕ, а не по валидности:
 * запрос, назвавший себя Bearer, решается заголовком, даже если токен в нём
 * битый (тогда он просто аноним). Иначе протухший Bearer молча «чинился» бы
 * случайной кукой того же клиента, и одна и та же ошибка давала бы два разных
 * ответа в зависимости от того, что ещё лежит в запросе. Прочие схемы
 * (`Basic` от staging-прокси с паролем, `OAuth`, `Api-Key`) сессии не касаются —
 * для них решает кука, как и раньше.
 *
 * Модуль без зависимостей: его импортирует и `src/proxy.ts`.
 */

const BEARER_SCHEME = /^bearer(?:\s|$)/i;
const BEARER_TOKEN = /^bearer\s+(\S+)$/i;

/** Заявлена ли схема Bearer (независимо от того, годен ли сам токен). */
export function isBearerAuthorization(authorization: string | null | undefined): boolean {
  if (!authorization) return false;
  return BEARER_SCHEME.test(authorization.trim());
}

/** Токен из `Authorization: Bearer <token>`; `null` — схема не та или токена нет. */
export function parseBearerToken(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const match = BEARER_TOKEN.exec(authorization.trim());
  return match ? match[1] : null;
}

/**
 * Какой access-токен действует для запроса: Bearer-заголовок, если схема
 * заявлена (даже битый — см. шапку), иначе кука.
 */
export function selectAccessToken(
  authorization: string | null | undefined,
  cookieToken: string | null | undefined,
): string | null {
  if (isBearerAuthorization(authorization)) return parseBearerToken(authorization);
  return cookieToken || null;
}
