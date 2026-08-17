import "server-only";

/**
 * RES-24 — верхняя граница одного запроса к БД.
 *
 * Пул Prisma ограничен по числу соединений, а `statement_timeout` в Postgres по
 * умолчанию `0`, то есть «никогда». Один патологический запрос (пропавший
 * индекс, ожидание блокировки) держал слот пула до победного, и слоты кончались
 * — а RES-04 показал, чем это оборачивается: прокси делает исходящий запрос к
 * самому себе и ждёт его, поэтому исчерпание пула затягивает петлю само на себя.
 *
 * Граница ставится **на стороне сервера БД**, а не клиента: Postgres отменяет
 * сам запрос (SQLSTATE 57014), поэтому освобождается и слот пула, и работа на
 * БД. Клиентский `socket_timeout` отпустил бы только слот, оставив запрос
 * молотить дальше.
 *
 * Почему не в `DATABASE_URL`: тот же URL читает движок миграций, а
 * `migrate deploy` валидирует существующие строки под FK и CHECK (LOGIC-19/20) —
 * на большой таблице это законно долгая операция, и общий потолок отменял бы
 * её. Здесь граница действует только на клиентов приложения.
 *
 * Соседние параметры пула НЕ задаются намеренно: `connect_timeout` (5 с) и
 * `pool_timeout` (10 с) у Prisma уже конечны по умолчанию, а `connection_limit`
 * — решение о топологии (число реплик × размер пула против `max_connections`
 * Postgres), его место в `DEPLOY-BACKLOG.md`, не в коде.
 */
export const DB_STATEMENT_TIMEOUT_MS = 30_000;

/**
 * Дописывает `statement_timeout` в строку подключения, **не трогая** URL, где
 * оператор уже задал `options` — это и есть путь переопределения без правки
 * кода. Пустой/отсутствующий URL возвращается как есть: тогда Prisma берёт
 * datasource из схемы, и ломать эту ветку нельзя (build-time импорт).
 */
export function withStatementTimeout(url: string, timeoutMs?: number): string;
export function withStatementTimeout(
  url: string | undefined,
  timeoutMs?: number
): string | undefined;
export function withStatementTimeout(
  url: string | undefined,
  timeoutMs: number = DB_STATEMENT_TIMEOUT_MS
): string | undefined {
  if (!url) return url;
  if (/[?&]options=/.test(url)) return url;

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}options=${encodeURIComponent(`-c statement_timeout=${timeoutMs}`)}`;
}
