"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DateNavigator, periodLabel, type ScheduleNavView } from "@/features/schedule-nav/components/date-navigator";
import { FreeWindowsButton } from "@/features/schedule-nav/components/free-windows-dialog";
import type { FreeWindowsDayItem } from "@/features/schedule-nav/lib/free-windows-text";
import { mondayOf } from "@/features/schedule-nav/lib/month-grid";
import { localDayRangeUtc } from "@/lib/schedule/dateKey";
import {
  SCHEDULE_DAY_PARAM,
  SCHEDULE_VIEW_PARAM,
  listWeekIsos,
  replaceDayInUrl,
  resolveSelectedDayIso,
  type ScheduleView,
} from "./schedule-view-state";

type Props = {
  weekStartIso: string;
  /** Сегодня в зоне мастера (salon-tz) — от него считается «Сегодня» и подсветка. */
  todayIso: string;
  view: ScheduleView;
  /** Пояс мастера (rule 17): время свободных окошек — по его часам. */
  timezone: string;
  /** Свободные окошки семи дней недели. */
  freeDays: FreeWindowsDayItem[];
};

/**
 * Верх страницы расписания: вид «День / Неделя», стрелки, подпись периода с
 * календарём на месяц, «Сегодня» и «Свободные окошки».
 *
 * SCHEDULE-FLEX-DATE-NAV (2026-10-30): любая дата выбирается в календаре по
 * нажатию на подпись периода; переход на другую неделю показывает ожидание
 * (без него медленный ответ сервера читался как «стрелки не работают»).
 * Неделя — с сервера (`?weekStart=`), день внутри показанной недели — без
 * запроса (`?day=` через `history.replaceState`, PWA-UX-BATCH-01).
 */
export function ScheduleControls({ weekStartIso, todayIso, view, timezone, freeDays }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const selectedIso = resolveSelectedDayIso({
    dayParam: searchParams.get(SCHEDULE_DAY_PARAM),
    weekStartIso,
    todayIso,
  });
  const weekIsos = listWeekIsos(weekStartIso);

  const navigate = ({ view: nextView, dateKey }: { view: ScheduleNavView; dateKey: string }) => {
    if (nextView === view && view === "day" && weekIsos.includes(dateKey)) {
      replaceDayInUrl(dateKey);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set(SCHEDULE_VIEW_PARAM, nextView);
    params.set("weekStart", mondayOf(dateKey));
    params.set(SCHEDULE_DAY_PARAM, dateKey);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const shownDays = view === "day" ? freeDays.filter((day) => day.dateKey === selectedIso) : freeDays;
  const label = periodLabel(view, selectedIso, todayIso);

  return (
    <DateNavigator
      view={view}
      dateKey={selectedIso}
      todayKey={todayIso}
      onNavigate={navigate}
      pending={pending}
      labelTestId="schedule-period-label"
      actions={
        <FreeWindowsButton
          sections={[{ id: "master", title: null, days: shownDays }]}
          periodLabel={label}
          timeZone={timezone}
          zoneIso={localDayRangeUtc(selectedIso, timezone).startUtc.toISOString()}
        />
      }
    />
  );
}
