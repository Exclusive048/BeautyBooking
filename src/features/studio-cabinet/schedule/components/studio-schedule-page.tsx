import type { StudioScheduleView } from "../lib/view-state";
import type { StudioScheduleData } from "../server/types";
import { DayGrid } from "./day-view/day-grid";
import { ScheduleHeader } from "./schedule-header";
import { ScheduleLegend } from "./schedule-legend";
import { StudioWeekAgenda } from "./week-view/week-agenda";
import { WeekGrid } from "./week-view/week-grid";

type Props = {
  studioId: string;
  view: StudioScheduleView;
  data: StudioScheduleData;
  /**
   * STUDIO-MASTERS-PRIVACY-FIX-A: master id decoded from the
   * `?master=<token>` deep-link. The day grid uses it to scroll the
   * grid horizontally so the master's column is in view. Null when
   * the URL has no token, or the token failed verification (silent
   * fall-through — page still renders the full studio calendar).
   */
  focusMasterId?: string;
};

/**
 * Server orchestrator for `/cabinet/studio/calendar`. Receives the
 * pre-fetched schedule payload and lays out: header → day or week grid
 * (driven by `?view`) → legend.
 *
 * Плиток с показателями периода здесь нет: суммы и загрузка — в аналитике и
 * на главной кабинета, календарь сразу показывает сетку. Неделя на ПК —
 * таблица с записями, на телефоне — список по дням. Легенда цветов — под
 * сеткой: справка, а не первое, что видно.
 */
export function StudioSchedulePage({ studioId, view, data, focusMasterId }: Props) {
  const week = view === "week" ? data.week : null;
  return (
    <div className="space-y-3 lg:space-y-5">
      <ScheduleHeader
        studioId={studioId}
        view={view}
        dateKey={data.dateKey}
        todayKey={data.todayKey}
        dayStartIso={data.day.dayStartIso}
        timezone={data.timezone}
        masters={data.day.columns}
        breaks={data.day.breaks}
        services={data.services}
        freeWindows={data.freeWindows}
      />
      {week ? (
        <>
          <div className="hidden md:block">
            <WeekGrid week={week} timezone={data.timezone} />
          </div>
          <div className="md:hidden">
            <StudioWeekAgenda week={week} timezone={data.timezone} />
          </div>
        </>
      ) : (
        <DayGrid
          studioId={studioId}
          day={data.day}
          timezone={data.timezone}
          services={data.services}
          focusMasterId={focusMasterId}
        />
      )}
      <ScheduleLegend />
    </div>
  );
}
