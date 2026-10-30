/**
 * Где в колонке выходного дня поставить подпись «Выходной».
 *
 * Подпись стояла по центру колонки, а записи выходного дня (разовое «Особое
 * время», перенос) рисуются поверх — и полупрозрачная карточка «Новый клиент»
 * ложилась прямо на текст. Теперь подпись встаёт в середину самого высокого
 * свободного от записей и блокировок участка видимого окна; если такого
 * участка выше `minPx` нет, подписи нет вовсе — выходной видно по затемнению
 * колонки. Минуты — от полуночи салона, как у карточек колонки.
 */

export type MinuteSpan = { startMin: number; endMin: number };

/** Значок 24px + отступ + строка 12px с запасом сверху и снизу. */
export const DAY_OFF_LABEL_MIN_PX = 56;

export function dayOffLabelCenterPx(input: {
  occupied: MinuteSpan[];
  hourStart: number;
  hourEnd: number;
  hourPx: number;
  minPx?: number;
}): number | null {
  const windowStart = input.hourStart * 60;
  const windowEnd = input.hourEnd * 60;
  if (windowEnd <= windowStart) return null;
  const pxPerMin = input.hourPx / 60;
  const minPx = input.minPx ?? DAY_OFF_LABEL_MIN_PX;

  const spans = input.occupied
    .map((span) => ({
      startMin: Math.max(windowStart, span.startMin),
      endMin: Math.min(windowEnd, span.endMin),
    }))
    .filter((span) => span.endMin > span.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  const gaps: MinuteSpan[] = [];
  let cursor = windowStart;
  for (const span of spans) {
    if (span.startMin > cursor) gaps.push({ startMin: cursor, endMin: span.startMin });
    cursor = Math.max(cursor, span.endMin);
  }
  if (windowEnd > cursor) gaps.push({ startMin: cursor, endMin: windowEnd });

  // Самый высокий участок; при равенстве — первый сверху.
  let best: MinuteSpan | null = null;
  for (const gap of gaps) {
    if (!best || gap.endMin - gap.startMin > best.endMin - best.startMin) best = gap;
  }
  if (!best || (best.endMin - best.startMin) * pxPerMin < minPx) return null;
  return ((best.startMin + best.endMin) / 2 - windowStart) * pxPerMin;
}
