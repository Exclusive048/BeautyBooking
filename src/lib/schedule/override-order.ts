import type { Prisma } from "@prisma/client";

/**
 * LOGIC-11 — какая из дублирующихся строк `ScheduleOverride` считается
 * действующей.
 *
 * В схеме на `(providerId, date)` только индексы, уникальности нет, а все
 * писатели делают check-then-insert без транзакции: автосейв настроек
 * расписания (debounce 500 мс) при быстрых правках даёт два параллельных
 * применения снапшота, оба видят `existing = null` и создают по строке.
 *
 * Дальше потребители расходились ДВАЖДЫ:
 *   - guard рабочих часов и движок читали без `orderBy` — какую строку вернёт
 *     планировщик Postgres, не определено;
 *   - и даже при одинаковом порядке они выбирали РАЗНЫЕ строки: движок берёт
 *     ПЕРВОЕ совпадение по дате (`findOverrideForDate`), а генератор слотов
 *     складывал строки в `Map` — то есть побеждала ПОСЛЕДНЯЯ.
 *
 * Итог — `assertWithinMasterWorkHours` мог разрешить перенос, которого
 * генератор слотов не предлагал, и наоборот, недетерминированно.
 *
 * Здесь фиксируются обе половины правила: канонический порядок (свежая правка
 * важнее; `id` — тотальный тай-брейк, потому что `updatedAt` у двух строк,
 * созданных в одной миллисекунде, совпадает) и направление выбора —
 * **побеждает ПЕРВАЯ строка**. Ноль дубликатов это не отменяет: настоящее
 * лечение — `@@unique([providerId, date])`, но оно требует дедупа существующих
 * данных, то есть решения владельца (см. `AUDIT-CAMPAIGN-BLOCKED.md`).
 */
export const SCHEDULE_OVERRIDE_PICK_ORDER = [
  { updatedAt: "desc" },
  { id: "desc" },
] satisfies Prisma.ScheduleOverrideOrderByWithRelationInput[];

/** То же правило для запросов по диапазону дат: сначала дата, потом канон. */
export const SCHEDULE_OVERRIDE_RANGE_ORDER = [
  { date: "asc" },
  ...SCHEDULE_OVERRIDE_PICK_ORDER,
] satisfies Prisma.ScheduleOverrideOrderByWithRelationInput[];
