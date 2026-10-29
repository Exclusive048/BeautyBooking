import { toLocalDateKey } from "@/lib/schedule/timezone";

/**
 * SLOTS-FLUSH-STARTS (2026-10-29) — `?after=<ISO>` у выдачи окошек: момент,
 * с которого визард пакета показывает время следующей услуги (конец предыдущей
 * + пауза мастера). Предыдущая услуга ещё не записана, поэтому день мастера о
 * ней не знает, и время «сразу после» неё без подсказки не появилось бы.
 * Выдача добавляет этот момент к началам дня (`buildSlotsForDay.extraStartsUtc`)
 * и проверяет как любое другое начало.
 *
 * Действует только для запроса ОДНОГО дня — того, на который приходится момент
 * в поясе салона: с подсказкой кэш окошек обходится, и диапазон без этого
 * ограничения стал бы способом пересчитать недели расписания на каждый запрос.
 * Неподходящее значение молча не учитывается — это подсказка, а не условие.
 * Сервер при записи пакета выводит такие начала сам (`packageFlushStarts`) и
 * этому параметру не доверяет.
 */
export function resolveFlushAfterParam(
  raw: string | null,
  request: { fromKey: string; toKey: string; limit: number | undefined; timeZone: string },
): Date | null {
  if (!raw) return null;
  const singleDay = request.toKey ? request.toKey === request.fromKey : request.limit === 1;
  if (!singleDay) return null;
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) return null;
  if (toLocalDateKey(value, request.timeZone) !== request.fromKey) return null;
  return value;
}
