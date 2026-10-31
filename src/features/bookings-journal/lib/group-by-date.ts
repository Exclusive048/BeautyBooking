/**
 * BOOKINGS-JOURNAL — записи журнала по дням салона. Порядок записей и дней —
 * тот, в котором записи пришли (сервер уже отсортировал по времени начала),
 * поэтому группировка не пересортировывает ни внутри дня, ни между днями.
 */

export type JournalDayGroup<T> = {
  /** Дата салона `YYYY-MM-DD`; `null` — у записи нет времени. */
  dateKey: string | null;
  items: T[];
};

export function groupByDateKey<T>(
  items: readonly T[],
  dateKeyOf: (item: T) => string | null,
): JournalDayGroup<T>[] {
  const groups: JournalDayGroup<T>[] = [];
  const byKey = new Map<string | null, JournalDayGroup<T>>();
  for (const item of items) {
    const key = dateKeyOf(item);
    let group = byKey.get(key);
    if (!group) {
      group = { dateKey: key, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}
