"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Repeat, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CalendarDaySheet,
  formatCalendarDate,
} from "@/features/master/components/schedule-settings/calendar/calendar-day-sheet";
import {
  DAY_COLOR_FILL,
  applyPaintOptimistic,
  compactHour,
} from "@/features/master/components/schedule-settings/calendar/lib/calendar-grid";
import { templateDisplayName } from "@/features/master/components/schedule-settings/calendar/lib/template-label";
import {
  WEEKDAY_SHORT,
  summarizePattern,
  weekdayIndex,
} from "@/features/master/components/schedule-settings/plan/lib/describe-plan";
import { ScheduleWizard } from "@/features/master/components/schedule-settings/plan/schedule-wizard";
import {
  schedulePatternEndpoint,
  scheduleSubEndpoint,
} from "@/features/master/components/schedule-settings/schedule-endpoint-context";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import {
  isScheduleEndingSoon,
  type CalendarDayDto,
  type CalendarPaintAction,
  type TeamBoardDto,
  type TeamBoardMasterDto,
} from "@/lib/schedule/calendar-shared";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { cn } from "@/lib/cn";
import { TeamRhythmModal } from "./team-rhythm-modal";

const T = UI_TEXT.studioCabinet.scheduleTeam;
const PLAN_T = UI_TEXT.cabinetMaster.scheduleSettings.plan;
const CAL = UI_TEXT.cabinetMaster.scheduleSettings.calendar;

type Brush = Extract<CalendarPaintAction, { kind: "off" } | { kind: "reset" }>;

type Props = {
  /** `Studio.id` — параметр `?studioId=` API расписания мастера. */
  studioId: string;
  initialBoard: TeamBoardDto;
};

/**
 * SCHEDULE-PATTERNS-01 (этап 4) — «График команды»: мастера студии × 14 дней.
 * Решение владельца: у студии — доска смен команды поверх тех же графиков и
 * календарей, что у каждого мастера (палитра у каждого своя).
 *
 * Правка дня — тем же календарём мастера (`PUT …/schedule/calendar?studioId&
 * masterId`): кисти «Выходной» / «Как по графику» красят сразу, без кисти —
 * шторка дня с палитрой этого мастера. «Задать график» по строке — то же
 * пошаговое окно; «График по очереди» — один график нескольким мастерам со
 * сдвигом. Снизу — строка покрытия: сколько мастеров работает в день.
 */
export function TeamBoard({ studioId, initialBoard }: Props) {
  const [board, setBoard] = useState(initialBoard);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brush, setBrush] = useState<Brush | null>(null);
  const [openCell, setOpenCell] = useState<{ masterId: string; date: string } | null>(null);
  const [wizardFor, setWizardFor] = useState<string | null>(null);
  const [rhythmOpen, setRhythmOpen] = useState(false);
  const [overlay, setOverlay] = useState<Record<string, CalendarPaintAction>>({});
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  // Окно, которое сейчас на экране: перечитка после правки берёт его, даже если
  // неделю пролистали, пока правка летела.
  const fromRef = useRef(initialBoard.fromKey);

  const endpointFor = useCallback(
    (masterId: string) =>
      `/api/cabinet/master/schedule?studioId=${encodeURIComponent(studioId)}&masterId=${encodeURIComponent(masterId)}`,
    [studioId],
  );

  const load = useCallback(async (fromKey: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ board: TeamBoardDto }>(
        `/api/studio/schedule/team?from=${encodeURIComponent(fromKey)}`,
      );
      fromRef.current = data.board.fromKey;
      setBoard(data.board);
    } catch (caught) {
      setError(serverMessageOr(caught, T.loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  const paint = (masterId: string, date: string, action: CalendarPaintAction) => {
    const key = `${masterId}:${date}`;
    setError(null);
    setOverlay((prev) => ({ ...prev, [key]: action }));
    // Правки идут по одной: доска перечитывается после каждой, чтобы ответ
    // сервера («совпало с графиком — правка снята») был виден сразу.
    chainRef.current = chainRef.current.then(async () => {
      try {
        await fetchJson(scheduleSubEndpoint(endpointFor(masterId), "/calendar"), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dates: [date], action }),
        });
        const data = await fetchJson<{ board: TeamBoardDto }>(
          `/api/studio/schedule/team?from=${encodeURIComponent(fromRef.current)}`,
        );
        if (data.board.fromKey === fromRef.current) setBoard(data.board);
      } catch (caught) {
        setError(serverMessageOr(caught, T.saveError));
      } finally {
        setOverlay((prev) => {
          if (prev[key] !== action) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    });
  };

  const onCellClick = (master: TeamBoardMasterDto, day: CalendarDayDto) => {
    if (day.beyond) return;
    if (brush && !day.past) {
      paint(master.id, day.date, brush);
      return;
    }
    setOpenCell({ masterId: master.id, date: day.date });
  };

  const shiftWeek = (days: number) => {
    const next = addDaysToDateKey(board.fromKey, days);
    void load(next < board.minFromKey ? board.minFromKey : next);
  };

  const displayed = (master: TeamBoardMasterDto, day: CalendarDayDto): CalendarDayDto => {
    const action = overlay[`${master.id}:${day.date}`];
    return action ? applyPaintOptimistic(day, action, null) : day;
  };

  const coverage = board.dates.map(
    (_date, index) =>
      board.masters.filter((master) => {
        const day = master.days[index];
        return day ? displayed(master, day).isWorking : false;
      }).length,
  );

  const openMaster = openCell ? board.masters.find((master) => master.id === openCell.masterId) ?? null : null;
  const openDay = openMaster && openCell ? openMaster.days.find((day) => day.date === openCell.date) ?? null : null;
  const wizardMaster = wizardFor ? board.masters.find((master) => master.id === wizardFor) ?? null : null;

  if (board.masters.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border-subtle bg-bg-card p-10 text-center">
        <p className="text-base font-semibold text-text-main">{T.emptyTitle}</p>
        <p className="max-w-md text-sm text-text-sec">{T.emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="team-schedule">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <BrushButton active={brush?.kind === "off"} onClick={() => setBrush(brush?.kind === "off" ? null : { kind: "off" })}>
            {CAL.offBrush}
          </BrushButton>
          <BrushButton
            active={brush?.kind === "reset"}
            onClick={() => setBrush(brush?.kind === "reset" ? null : { kind: "reset" })}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {CAL.resetBrush}
          </BrushButton>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="md"
          className="rounded-xl"
          onClick={() => setRhythmOpen(true)}
          data-guide="schedule"
        >
          <Repeat className="mr-1.5 h-4 w-4" aria-hidden />
          {T.rhythmCta}
        </Button>
        <p className="w-full text-xs text-text-sec">
          {brush ? CAL.brushHint(brush.kind === "off" ? CAL.offBrush : CAL.resetBrush) : T.subtitle}
        </p>
      </div>

      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-danger-text">{error}</p>
          <Button type="button" variant="secondary" size="sm" className="rounded-xl" onClick={() => void load(board.fromKey)}>
            {T.retry}
          </Button>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border-subtle bg-bg-card p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="icon"
            size="icon"
            aria-label={T.prevAria}
            disabled={loading || board.fromKey <= board.minFromKey}
            onClick={() => shiftWeek(-7)}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-xl"
            disabled={loading || board.fromKey === board.todayKey}
            onClick={() => void load(board.todayKey)}
          >
            {T.todayCta}
          </Button>
          <Button
            type="button"
            variant="icon"
            size="icon"
            aria-label={T.nextAria}
            disabled={loading || addDaysToDateKey(board.fromKey, 14) > board.lastKey}
            onClick={() => shiftWeek(7)}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Button>
        </div>

        <div className={cn("overflow-x-auto", loading && "opacity-60")}>
          <table className="w-full min-w-max border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-bg-card px-2 text-left font-medium text-text-sec">{T.masterColumn}</th>
                {board.dates.map((date) => (
                  <th
                    key={date}
                    className={cn(
                      "w-11 min-w-11 px-0.5 text-center font-medium",
                      date === board.todayKey ? "text-text-main" : "text-text-sec",
                    )}
                  >
                    <span className="block uppercase">{WEEKDAY_SHORT[weekdayIndex(date)]}</span>
                    <span className="block text-sm">{Number(date.slice(8, 10))}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.masters.map((master) => (
                <tr key={master.id}>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 w-28 min-w-28 max-w-28 bg-bg-card px-2 py-1 text-left align-top sm:w-44 sm:min-w-44 sm:max-w-44"
                  >
                    <span className="block truncate text-sm font-medium text-text-main">{master.name}</span>
                    <span className="block truncate text-2xs font-normal text-text-sec">
                      {master.plan.current ? summarizePattern(master.plan.current, master.plan.templates) : T.noSchedule}
                    </span>
                    {/* Заданный вперёд график («2 через 2» с завтра) — иначе строка
                        показывает только то, что действует сегодня. */}
                    {master.plan.upcoming[0]?.startsOn ? (
                      <span className="block truncate text-2xs font-normal text-text-sec">
                        {PLAN_T.upcomingLabel(
                          UI_FMT.dateShort(`${master.plan.upcoming[0].startsOn}T12:00:00.000Z`, { timeZone: "UTC" }),
                          summarizePattern(master.plan.upcoming[0], master.plan.templates),
                        )}
                      </span>
                    ) : null}
                    {/* Расписание кончается в ближайшую неделю — тем же правилом, что баннер мастера. */}
                    {isScheduleEndingSoon(master.plan) && master.plan.configuredUntil ? (
                      <span
                        className="mt-0.5 block truncate text-2xs font-medium text-warning-text"
                        data-testid="team-board-ending-soon"
                      >
                        {T.endingSoon(
                          UI_FMT.dateShort(`${master.plan.configuredUntil}T12:00:00.000Z`, { timeZone: "UTC" }),
                        )}
                      </span>
                    ) : null}
                    <span className="mt-1 flex flex-col items-start gap-0.5 sm:flex-row sm:flex-wrap sm:gap-x-3">
                      <Button
                        type="button"
                        variant="wrapper"
                        size="none"
                        className="text-2xs font-medium text-accent-text underline-offset-2 hover:underline"
                        onClick={() => setWizardFor(master.id)}
                      >
                        {T.setScheduleCta}
                      </Button>
                      <Link
                        href={`/cabinet/studio/schedule/settings?master=${encodeURIComponent(master.id)}`}
                        className="hidden text-2xs text-text-sec underline-offset-2 hover:underline sm:inline"
                      >
                        {T.settingsLink}
                      </Link>
                    </span>
                  </th>
                  {master.days.map((raw) => {
                    const day = displayed(master, raw);
                    const template = day.templateId
                      ? master.plan.templates.find((item) => item.id === day.templateId)
                      : undefined;
                    return (
                      <td key={day.date} className="p-0">
                        <TeamCell
                          day={day}
                          today={day.date === board.todayKey}
                          templateName={template ? templateDisplayName(template) : null}
                          fill={template ? DAY_COLOR_FILL[template.color] : null}
                          pending={Boolean(overlay[`${master.id}:${day.date}`])}
                          masterName={master.name}
                          onClick={() => onCellClick(master, raw)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row" className="sticky left-0 z-10 bg-bg-card px-2 text-left font-medium text-text-sec">
                  {T.coverageLabel}
                </th>
                {coverage.map((count, index) => (
                  <td
                    key={board.dates[index]}
                    aria-label={count === 0 ? T.noCoverageAria : undefined}
                    className={cn(
                      "rounded-lg py-1 text-center text-sm font-medium",
                      count === 0 ? "bg-warning-surface text-warning-text" : "text-text-main",
                    )}
                  >
                    {count}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {openMaster && openDay ? (
        <CalendarDaySheet
          key={`${openMaster.id}:${openDay.date}`}
          day={openDay}
          templates={openMaster.plan.templates}
          onClose={() => setOpenCell(null)}
          onPaint={(action) => {
            paint(openMaster.id, openDay.date, action);
            setOpenCell(null);
          }}
        />
      ) : null}

      {wizardMaster ? (
        <ScheduleWizard
          open
          onClose={() => setWizardFor(null)}
          plan={wizardMaster.plan}
          timezone={wizardMaster.timezone}
          patternEndpoint={schedulePatternEndpoint(endpointFor(wizardMaster.id))}
          previewEndpoint={schedulePatternEndpoint(endpointFor(wizardMaster.id), "/preview")}
          onApplied={() => {
            setWizardFor(null);
            void load(board.fromKey);
          }}
        />
      ) : null}

      {rhythmOpen ? (
        <TeamRhythmModal
          open
          onClose={() => setRhythmOpen(false)}
          masters={board.masters.map((master) => ({ id: master.id, name: master.name }))}
          todayKey={board.todayKey}
          lastKey={board.lastKey}
          endpointFor={endpointFor}
          onApplied={() => void load(board.fromKey)}
        />
      ) : null}
    </div>
  );
}

function BrushButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="wrapper"
      size="none"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm text-text-sec",
        active ? "border-primary ring-2 ring-primary/40" : "border-border-subtle",
      )}
    >
      {children}
    </Button>
  );
}

function TeamCell({
  day,
  today,
  templateName,
  fill,
  pending,
  masterName,
  onClick,
}: {
  day: CalendarDayDto;
  today: boolean;
  templateName: string | null;
  fill: string | null;
  pending: boolean;
  masterName: string;
  onClick: () => void;
}) {
  const hours = day.isWorking ? (day.fixed ? CAL.fixedLabel : `${compactHour(day.start)}–${compactHour(day.end)}`) : "";
  const label = [
    masterName,
    formatCalendarDate(day.date),
    day.isWorking ? templateName ?? hours : CAL.dayOffAria,
    day.painted ? CAL.paintedAria : null,
    day.bookings > 0 ? CAL.bookingsAria(day.bookings) : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <Button
      type="button"
      variant="wrapper"
      size="none"
      disabled={day.beyond}
      aria-label={label}
      data-testid="team-schedule-cell"
      data-date={day.date}
      onClick={onClick}
      className={cn(
        "relative flex h-11 w-11 flex-col items-center justify-center rounded-lg text-3xs leading-tight transition-opacity",
        day.isWorking
          ? fill ?? "bg-bg-input ring-1 ring-inset ring-border-subtle"
          : "border border-dashed border-border-subtle",
        day.past && "opacity-50",
        day.beyond && "cursor-default opacity-30",
        today && "ring-2 ring-primary",
        pending && "opacity-70",
      )}
    >
      <span className="text-text-main">{hours}</span>
      {day.painted ? <span aria-hidden className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-accent-text" /> : null}
      {day.bookings > 0 ? (
        <span aria-hidden className="absolute right-0.5 top-0.5 rounded-full bg-bg-card px-1 text-3xs font-medium text-text-main">
          {day.bookings}
        </span>
      ) : null}
    </Button>
  );
}
