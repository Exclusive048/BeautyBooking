/**
 * DB-RESET-01 (решение владельца 2026-10-13) — разовая очистка боевой базы
 * «с нуля», чтобы заново пройти продукт руками с учётом изменившегося
 * функционала.
 *
 * Здесь только чистые правила: что такое запрос, когда он срабатывает, какие
 * таблицы остаются и как собрать TRUNCATE. Ввод-вывод (база, хранилище, Redis)
 * — в `scripts/reset-database.ts`, запускает его шаг деплоя 5/7 (а).
 *
 * ## Когда срабатывает
 *
 * Только при всех трёх условиях:
 *   1. в репозитории лежит запрос `scripts/db-reset-request.json` (`id` + `notAfter`);
 *   2. сегодня (UTC) не позже `notAfter` — забытый в репозитории запрос
 *      перестаёт действовать сам, а не ждёт случайного деплоя через полгода;
 *   3. в базе нет отметки о том, что запрос с этим `id` уже выполнен.
 *      Отметка пишется в `SystemConfig` той же транзакцией, что и очистка,
 *      поэтому «очищено, но не отмечено» не бывает, а повторный деплой с тем
 *      же запросом ничего не трогает.
 *
 * ## Что остаётся (решение владельца: «справочники и настройки»)
 *
 * История миграций, тарифы с ценами из админки, справочные города, теги
 * отзывов и системные настройки (ключ сообщества ВКонтакте, переключатели).
 * Всё остальное — любая таблица схемы, в том числе появившаяся позже, —
 * очищается: список очищаемого выводится из базы, а не перечисляется.
 * Города, выросшие из геокодера (`autoCreated`), удаляются отдельно.
 *
 * 🔴 Оставить можно только таблицу, которая НЕ ссылается на очищаемые: TRUNCATE
 * без CASCADE откажет на такой связи (с CASCADE — молча очистил бы и её).
 * Поэтому `GlobalCategory` (автор → `UserProfile`) и `Tag` (→ `GlobalCategory`)
 * очищаются; фиксированный набор категорий возвращает `deploy:post`.
 * Правило держат и тест по схеме (`database-reset.test.ts`), и проверка по
 * живой базе в скрипте до первого изменения.
 */

/** Путь запроса относительно корня репозитория (и `/app` worker-образа — `scripts` копируется целиком). */
export const DB_RESET_REQUEST_PATH = "scripts/db-reset-request.json";

/** Ключ отметки «запрос выполнен» в `SystemConfig` (таблица остаётся). */
export const DB_RESET_MARKER_KEY = "opsDatabaseReset";

/** Таблицы, которые очистка не трогает. Имена — как в базе (`@@map` учитывать). */
export const DB_RESET_KEPT_TABLES: readonly string[] = [
  "_prisma_migrations",
  "BillingPlan",
  "BillingPlanPrice",
  "City",
  "ReviewTag",
  "SystemConfig",
];

export type DbResetRequest = {
  /** Метка запроса: латиница, цифры, дефис. Новая очистка — новый `id`. */
  id: string;
  /** Последний день (UTC, `YYYY-MM-DD` включительно), когда запрос действует. */
  notAfter: string;
};

export type DbResetDecision =
  | { action: "apply" }
  | { action: "skip"; reason: "expired" | "already-done" };

export type ForeignKeyEdge = {
  name: string;
  fromTable: string;
  toTable: string;
};

const REQUEST_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Разбор запроса. Кривой запрос — ошибка, а не «пропустить»: файл кладут
 * осознанно, и молча проигнорированная опечатка выглядела бы как выполненная
 * очистка.
 */
export function parseDbResetRequest(raw: unknown): DbResetRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Запрос очистки должен быть JSON-объектом { id, notAfter }.");
  }
  const { id, notAfter } = raw as Record<string, unknown>;
  if (typeof id !== "string" || !REQUEST_ID_PATTERN.test(id)) {
    throw new Error("В запросе очистки нужен id: 3–64 символа, строчная латиница, цифры и дефис.");
  }
  if (typeof notAfter !== "string" || !isRealDateKey(notAfter)) {
    throw new Error("В запросе очистки нужна дата notAfter в формате ГГГГ-ММ-ДД.");
  }
  return { id, notAfter };
}

/** `id` из отметки в `SystemConfig`; всё непохожее на отметку — «не выполнялось». */
export function readAppliedResetId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function decideDbReset(input: {
  request: DbResetRequest;
  todayUtc: string;
  appliedId: string | null;
}): DbResetDecision {
  if (input.appliedId === input.request.id) return { action: "skip", reason: "already-done" };
  // Ключи `YYYY-MM-DD` сравниваются как строки так же, как даты.
  if (input.todayUtc > input.request.notAfter) return { action: "skip", reason: "expired" };
  return { action: "apply" };
}

/** Что очищать: каждая таблица базы, кроме оставляемых. Отсортировано — отчёт читается стабильно. */
export function planTablesToWipe(allTables: readonly string[], kept: readonly string[]): string[] {
  const keep = new Set(kept);
  return [...new Set(allTables)].filter((table) => !keep.has(table)).sort();
}

/**
 * Связи «оставляемая таблица → очищаемая». Любая такая — отказ до первого
 * изменения: TRUNCATE её не переживёт, а строки оставляемой таблицы указывали
 * бы на пустоту.
 */
export function findKeptTableViolations(
  edges: readonly ForeignKeyEdge[],
  kept: readonly string[],
): ForeignKeyEdge[] {
  const keep = new Set(kept);
  return edges.filter((edge) => keep.has(edge.fromTable) && !keep.has(edge.toTable));
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Один TRUNCATE на все таблицы: связи между ними Postgres разрешает внутри
 * одного оператора. Без CASCADE намеренно — пропущенная связь на оставляемую
 * таблицу должна стать ошибкой, а не тихой очисткой справочника.
 */
export function buildTruncateSql(tables: readonly string[]): string {
  if (tables.length === 0) throw new Error("Нечего очищать: список таблиц пуст.");
  return `TRUNCATE TABLE ${tables.map(quoteIdent).join(", ")} RESTART IDENTITY`;
}
