"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import {
  addDays,
  formatDayLabel,
  formatWeekRange,
  parseIsoDateKey,
  toIsoDateKey,
} from "@/lib/master/schedule-utils";
import * as UI_TEXT from "@/lib/ui/text";
import {
  SCHEDULE_DAY_PARAM,
  SCHEDULE_VIEW_PARAM,
  listWeekIsos,
  replaceDayInUrl,
  resolveSelectedDayIso,
  shiftWeekIso,
  weekStartIsoOf,
  type ScheduleView,
} from "./schedule-view-state";

const T = UI_TEXT.cabinetMaster.schedule.controls;

type Props = {
  weekStartIso: string;
  /** Сегодня в зоне мастера (salon-tz) — от него считается «Сегодня» и подсветка. */
  todayIso: string;
  view: ScheduleView;
};

/**
 * Top-of-page controls — view toggle (День / Неделя) + prev / today / next
 * navigation with the current period label between the arrows.
 *
 * PWA-UX-BATCH-01 (2026-09-15). Прежняя форма была сломана в трёх местах:
 * вкладки «День» и «Месяц» помечались `disabled`, но выглядели нажимаемыми
 * (aria-disabled, не native) — владелец читал это как «фильтры не работают»;
 * «Сегодня» рендерил `<Link>` внутри `<button>` (две конкурирующие навигации)
 * и считал «сегодня» по браузеру, а не по зоне мастера; и подпись периода
 * жила только в подзаголовке шапки, который на телефоне уезжает с первой
 * прокруткой — то есть «Сегодня» «не меняло название», потому что названия
 * рядом не было. Теперь: два рабочих вида (месяц снят, а не заглушен),
 * подпись периода стоит между стрелками, «Сегодня» — `aria-pressed`, когда
 * период уже содержит сегодняшний день.
 */
export function ScheduleControls({ weekStartIso, todayIso, view }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const weekStart = parseIsoDateKey(weekStartIso) ?? new Date();
  const selectedIso = resolveSelectedDayIso({
    dayParam: searchParams.get(SCHEDULE_DAY_PARAM),
    weekStartIso,
    todayIso,
  });
  const selectedDate = parseIsoDateKey(selectedIso) ?? weekStart;
  const weekIsos = listWeekIsos(weekStartIso);
  const isDay = view === "day";

  const pushParams = (mutate: (params: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams.toString());
    mutate(next);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const goToWeek = (targetWeekStartIso: string, dayIso?: string) => {
    pushParams((params) => {
      params.set("weekStart", targetWeekStartIso);
      if (dayIso) params.set(SCHEDULE_DAY_PARAM, dayIso);
      else params.delete(SCHEDULE_DAY_PARAM);
    });
  };

  const goToDay = (iso: string) => {
    if (weekIsos.includes(iso)) {
      replaceDayInUrl(iso);
      return;
    }
    const targetWeek = weekStartIsoOf(iso);
    if (targetWeek) goToWeek(targetWeek, iso);
  };

  const step = (direction: -1 | 1) => {
    if (isDay) {
      goToDay(toIsoDateKey(addDays(selectedDate, direction)));
      return;
    }
    const target = shiftWeekIso(weekStartIso, direction);
    if (target) goToWeek(target);
  };

  const todayWeekIso = weekStartIsoOf(todayIso);
  const periodHasToday = isDay ? selectedIso === todayIso : weekIsos.includes(todayIso);
  const goToday = () => {
    if (periodHasToday) return;
    if (isDay) {
      goToDay(todayIso);
      return;
    }
    if (todayWeekIso) goToWeek(todayWeekIso);
  };

  const setView = (next: string) => {
    if (next !== "day" && next !== "week") return;
    if (next === view) return;
    pushParams((params) => {
      params.set(SCHEDULE_VIEW_PARAM, next);
      if (next === "day") params.set(SCHEDULE_DAY_PARAM, selectedIso);
    });
  };

  const periodLabel = isDay ? formatDayLabel(selectedDate) : formatWeekRange(weekStart);

  // Раскладка: на телефоне вкладки и «Сегодня» — первой строкой, стрелки с
  // подписью периода — второй, во всю ширину (в одной строке подпись
  // «14 — 20 сентября 2026» обрезалась до «14 — 20 с…» — живой прогон
  // PWA-UX-BATCH-01). С `sm` — всё в одну строку: вкладки · стрелки+подпись ·
  // «Сегодня» (порядок через `order-*`).
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <Tabs
        value={view}
        onChange={setView}
        items={[
          { id: "day", label: T.viewDay },
          { id: "week", label: T.viewWeek },
        ]}
      />

      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-pressed={periodHasToday}
        onClick={goToday}
        className={cn(
          "order-2 rounded-lg sm:order-3",
          periodHasToday && "border-primary/40 text-accent-text",
        )}
      >
        {T.today}
      </Button>

      <div className="order-3 flex w-full min-w-0 items-center gap-1 sm:order-2 sm:w-auto sm:flex-1 sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={isDay ? T.prevDay : T.prevWeek}
          onClick={() => step(-1)}
          className="h-9 w-9 shrink-0 rounded-lg"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <span
          data-testid="schedule-period-label"
          className="min-w-0 flex-1 truncate px-1 text-center text-sm font-medium tabular-nums text-text-main sm:flex-none"
        >
          {periodLabel}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={isDay ? T.nextDay : T.nextWeek}
          onClick={() => step(1)}
          className="h-9 w-9 shrink-0 rounded-lg"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
