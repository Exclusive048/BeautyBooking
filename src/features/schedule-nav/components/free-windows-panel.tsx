import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { formatZoneLabel } from "@/lib/ui/zone-label";
import { freeWindowsDayLine, type FreeWindowsSection } from "../lib/free-windows-text";

const T = UI_TEXT.schedule.freeWindows;

type Props = {
  sections: FreeWindowsSection[];
  /** Пояс салона: метка «(Город, GMT+N)» у списка (rule 17, salon-tz). */
  timeZone: string;
  /** Момент, на который берётся смещение пояса. */
  zoneIso: string;
  href: string;
  linkLabel: string;
  /** Сколько дней показать в секции (студия — по мастеру); остальное — «ещё N дн.». */
  maxDaysPerSection?: number;
};

/**
 * DASHBOARD-REORDER — «Свободные окошки» на главной кабинета: тот же расчёт,
 * что окно «Свободные окошки» расписания (`computeFreeWindows` из плана дня
 * движка), списком на неделю с сегодняшнего дня. Только дни со свободным
 * временем; время — минуты дня салона с меткой пояса.
 */
export function FreeWindowsPanel({
  sections,
  timeZone,
  zoneIso,
  href,
  linkLabel,
  maxDaysPerSection,
}: Props) {
  const zoneLabel = formatZoneLabel({ iso: zoneIso, timeZone });
  const visible = sections
    .map((section) => {
      const days = section.days.flatMap((day) => {
        if (day.past || day.isOff) return [];
        const line = freeWindowsDayLine(day);
        return line ? [{ dateKey: day.dateKey, line }] : [];
      });
      const shown = maxDaysPerSection ? days.slice(0, maxDaysPerSection) : days;
      return { id: section.id, title: section.title, days: shown, hidden: days.length - shown.length };
    })
    .filter((section) => section.days.length > 0);

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card" data-testid="free-windows-panel">
      <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-4 md:px-5">
        <div className="min-w-0">
          <h2 className="font-display text-lg text-text-main">{T.title}</h2>
          {zoneLabel ? <p className="mt-0.5 text-xs text-text-sec">{T.zoneNote(zoneLabel)}</p> : null}
        </div>
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 text-sm text-accent-text transition-colors hover:underline"
        >
          {linkLabel}
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </header>

      {visible.length > 0 ? (
        <div className="space-y-3 px-4 pb-4 md:px-5">
          {visible.map((section) => (
            <div key={section.id} className="space-y-1">
              {section.title ? (
                <h3 className="text-sm font-semibold text-text-main">{section.title}</h3>
              ) : null}
              <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
                {section.days.map((day) => (
                  <li key={day.dateKey} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:gap-3">
                    <span className="shrink-0 text-xs font-medium text-text-main sm:w-28">
                      {UI_FMT.dateKey(day.dateKey, "weekdayDayMonthShort")}
                    </span>
                    <span className="text-xs text-text-sec">{day.line}</span>
                  </li>
                ))}
              </ul>
              {section.hidden > 0 ? <p className="text-xs text-text-sec">{T.moreDays(section.hidden)}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="px-4 pb-4 text-sm text-text-sec md:px-5">{T.weekEmpty}</p>
      )}
    </section>
  );
}
