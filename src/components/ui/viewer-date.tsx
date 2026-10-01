"use client";

import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { UI_FMT, VIEWER_TZ, type DatePreset } from "@/lib/ui/fmt";

type ViewerDateProps = {
  value: Date | string | number;
  preset: DatePreset;
  className?: string;
};

/**
 * VIEWER-DATE-HYDRATION-MIDNIGHT (2026-10-01) — дата по часам ЗРИТЕЛЯ (rule 17,
 * tz-источник viewer-tz).
 *
 * Сервер не знает пояс зрителя и форматирует в поясе контейнера (UTC), браузер —
 * в своём: около полуночи UTC (21:00–24:00 для Москвы) они называют разные дни,
 * и React роняет гидратацию. Поэтому текст появляется только после гидратации;
 * до неё рендерится пустой `<time>` с машинным значением.
 */
export function ViewerDate({ value, preset, className }: ViewerDateProps) {
  const hydrated = useIsHydrated();
  const date = value instanceof Date ? value : new Date(value);
  const valid = !Number.isNaN(date.getTime());
  return (
    <time dateTime={valid ? date.toISOString() : undefined} className={className} suppressHydrationWarning>
      {hydrated && valid ? UI_FMT.date(date, preset, { timeZone: VIEWER_TZ }) : null}
    </time>
  );
}
