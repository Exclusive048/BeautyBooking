"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { Building2, ChevronLeft, ChevronRight, Hourglass, Palette, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSerialTask } from "@/hooks/use-serial-task";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import type {
  CalendarDayDto,
  CalendarPaintAction,
  CalendarRequestAction,
  CalendarStudioDayDto,
  ScheduleCalendarDto,
} from "@/lib/schedule/calendar-shared";
import type { ScheduleEditorSnapshot } from "@/lib/schedule/editor-shared";
import type { DayTemplateDto } from "@/lib/schedule/patterns-shared";
import * as UI_TEXT from "@/lib/ui/text";
import { cn } from "@/lib/cn";
import { WEEKDAY_SHORT } from "../plan/lib/describe-plan";
import { useOptionalSaveStatus } from "../save-status-provider";
import { scheduleSubEndpoint } from "../schedule-endpoint-context";
import { CalendarDaySheet, formatCalendarDate } from "./calendar-day-sheet";
import {
  DAY_COLOR_FILL,
  applyPaintOptimistic,
  bookingsOnDaysOff,
  buildMonthGrids,
  compactHour,
} from "./lib/calendar-grid";
import { templateDisplayName, templateHoursLabel } from "./lib/template-label";
import { PaletteModal } from "./palette-modal";

const T = UI_TEXT.cabinetMaster.scheduleSettings.calendar;
const MONTHS = UI_TEXT.publicProfile.bookingFlow.months;

type Props = {
  /** Основной адрес настроек расписания (`/api/cabinet/master/schedule` + параметры профиля). */
  endpoint: string;
  snapshot: ScheduleEditorSnapshot;
  onSnapshot: (snapshot: ScheduleEditorSnapshot) => void;
  /** Кисть, выбранная при открытии (например, рабочий день из «Каждый раз по-разному»). */
  initialBrushTemplateId?: string | null;
  /**
   * Профиль в студии (SCHEDULE-STUDIO-PROFILE-CALENDAR): покраска не пишет
   * расписание, а копится в открытой заявке студии. Палитра только для
   * выбора — новые рабочие дни здесь не заводятся.
   */
  requestMode?: boolean;
};

function actionKey(action: CalendarRequestAction | null): string {
  return action ? JSON.stringify(action) : "";
}

/**
 * SCHEDULE-PATTERNS-01 (этап 3) — календарь расписания на 3 месяца поверх
 * графика (решение владельца 2026-09-28, вариант В). Кисть — рабочий день
 * палитры, «Выходной» или «Как по графику»: с кистью нажатие красит день
 * сразу, без кисти открывает шторку дня.
 *
 * Сохранение — без кнопки (автосохранение): нажатия копятся в очереди и
 * отправляются пачками по одному действию; пока пачка летит, день показан
 * так, как его выбрали (оптимистично), ответ сервера — окончательный.
 * Очередь идёт через `useSerialTask`: запрос не летит рядом с другим, а
 * следующий забирает всё накопленное.
 *
 * Даты — даты салона; прошедшие дни только смотрятся, дальше 3 месяцев
 * расписания нет.
 *
 * В режиме заявки (профиль в студии) день в клетке показан таким, каким он
 * станет после одобрения, с отметкой «в заявке»; шторка дня показывает, что
 * сейчас, и умеет убрать день из заявки.
 */
export function ScheduleCalendarTab({
  endpoint,
  snapshot,
  onSnapshot,
  initialBrushTemplateId = null,
  requestMode = false,
}: Props) {
  const calendarEndpoint = scheduleSubEndpoint(endpoint, "/calendar");
  const paletteEndpoint = scheduleSubEndpoint(endpoint, "/palette");
  const templates = snapshot.schedulePlan.templates;
  const palette = templates.filter((item) => item.inPalette);
  const templatesById = useMemo(() => new Map(templates.map((item) => [item.id, item])), [templates]);
  const saveStatus = useOptionalSaveStatus();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const visibleMonths = desktop ? 3 : 1;

  const [calendar, setCalendar] = useState<ScheduleCalendarDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Record<string, CalendarRequestAction>>({});
  const [brush, setBrush] = useState<CalendarPaintAction | null>(
    initialBrushTemplateId ? { kind: "template", templateId: initialBrushTemplateId } : null,
  );
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState<null | "list" | "create">(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [keptBookings, setKeptBookings] = useState(false);
  const queueRef = useRef<Map<string, CalendarRequestAction>>(new Map());
  const touchStartX = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchJson<{ calendar: ScheduleCalendarDto }>(calendarEndpoint);
      setCalendar(data.calendar);
    } catch (error) {
      setLoadError(serverMessageOr(error, T.loadError));
    }
  }, [calendarEndpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const flush = useSerialTask<null>(async () => {
    while (queueRef.current.size > 0) {
      const batch = new Map(queueRef.current);
      queueRef.current.clear();
      const groups = new Map<string, { action: CalendarRequestAction; dates: string[] }>();
      for (const [date, action] of batch) {
        const key = actionKey(action);
        const group = groups.get(key) ?? { action, dates: [] };
        group.dates.push(date);
        groups.set(key, group);
      }
      saveStatus?.setStatus("saving");
      try {
        for (const group of groups.values()) {
          const data = await fetchJson<{ calendar: ScheduleCalendarDto; snapshot: ScheduleEditorSnapshot }>(
            calendarEndpoint,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ dates: group.dates, action: group.action }),
            },
          );
          setCalendar(data.calendar);
          onSnapshot(data.snapshot);
          // В заявке день ещё не изменился — предупреждать о записях рано.
          if (!requestMode && bookingsOnDaysOff(data.calendar.days, new Set(group.dates)) > 0) setKeptBookings(true);
        }
        saveStatus?.setStatus("saved");
      } catch (error) {
        const message = serverMessageOr(error, T.saveError);
        setSaveError(message);
        saveStatus?.setErrorMessage(message);
        saveStatus?.setStatus("error");
      } finally {
        // Показанное оптимистично снимается, когда пачка ушла; день, который
        // успели перекрасить ещё раз, остаётся в очереди со своим действием.
        setOverlay((prev) => {
          const next = { ...prev };
          for (const [date, action] of batch) {
            if (next[date] === action && !queueRef.current.has(date)) delete next[date];
          }
          return next;
        });
      }
    }
  });

  const paint = (dates: string[], action: CalendarRequestAction) => {
    setSaveError(null);
    setOverlay((prev) => {
      const next = { ...prev };
      for (const date of dates) next[date] = action;
      return next;
    });
    for (const date of dates) queueRef.current.set(date, action);
    void flush(null).catch(() => undefined);
  };

  // Заявка студии: дата → действие, с тем, что ещё летит на сервер.
  const requested = useMemo(() => {
    const map = new Map<string, CalendarPaintAction>((calendar?.pending?.days ?? []).map((day) => [day.date, day.action]));
    for (const [date, action] of Object.entries(overlay)) {
      if (action.kind === "withdraw") map.delete(date);
      else if (requestMode) map.set(date, action);
    }
    return map;
  }, [calendar, overlay, requestMode]);

  const days: CalendarDayDto[] = useMemo(() => {
    if (!calendar) return [];
    return calendar.days.map((day) => {
      const action = requestMode ? requested.get(day.date) : overlay[day.date];
      if (!action || action.kind === "withdraw") return day;
      const template = action.kind === "template" ? templatesById.get(action.templateId) : undefined;
      const shown = applyPaintOptimistic(
        day,
        action,
        template
          ? { startTime: template.startTime, endTime: template.endTime, fixed: template.scheduleMode === "FIXED" }
          : null,
      );
      // В заявке день ещё не изменён в расписании — отметку «изменён» не ставим.
      return requestMode ? { ...shown, painted: day.painted } : shown;
    });
  }, [calendar, overlay, requested, requestMode, templatesById]);

  const months = useMemo(() => buildMonthGrids(days), [days]);
  const maxOffset = Math.max(0, months.length - visibleMonths);
  const offset = Math.min(monthOffset, maxOffset);
  const shownMonths = months.slice(offset, offset + visibleMonths);
  // В режиме заявки шторка показывает день как он есть сейчас, а заявку — отдельно.
  const openDay = openDate
    ? (requestMode ? calendar?.days : days)?.find((day) => day.date === openDate) ?? null
    : null;
  const pending = calendar?.pending ?? null;
  const pendingNotEmpty = Boolean(pending && (pending.days.length > 0 || pending.hasPattern || pending.hasWeek));
  const brushTemplate = brush?.kind === "template" ? templatesById.get(brush.templateId) : undefined;
  const brushName =
    brush?.kind === "template" && brushTemplate
      ? templateDisplayName(brushTemplate)
      : brush?.kind === "off"
        ? T.offBrush
        : brush?.kind === "reset"
          ? T.resetBrush
          : null;

  const toggleBrush = (next: CalendarPaintAction) => {
    setBrush((current) => (actionKey(current) === actionKey(next) ? null : next));
  };

  const onDayClick = (day: CalendarDayDto) => {
    if (day.beyond) return;
    if (brush && !day.past) {
      paint([day.date], brush);
      return;
    }
    setOpenDate(day.date);
  };

  const onTouchStart = (event: TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    const end = event.changedTouches[0]?.clientX;
    if (start === null || end === undefined) return;
    const delta = end - start;
    if (Math.abs(delta) < 60) return;
    setMonthOffset((value) => Math.max(0, Math.min(maxOffset, Math.min(value, maxOffset) + (delta < 0 ? 1 : -1))));
  };

  if (loadError) {
    return (
      <section className="space-y-3 rounded-2xl border border-border-subtle bg-bg-card p-4">
        <p className="text-sm text-text-sec">{loadError}</p>
        <Button type="button" variant="secondary" size="md" className="rounded-xl" onClick={() => void load()}>
          {T.retry}
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-4" data-testid="schedule-calendar">
      <div className="space-y-3 rounded-2xl border border-border-subtle bg-bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-text-sec">{T.brushesLabel}</span>
          {requestMode ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-xl"
              onClick={() => setPaletteOpen("list")}
            >
              <Palette className="mr-1.5 h-4 w-4" aria-hidden />
              {T.paletteCta}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {palette.map((template) => (
            <BrushChip
              key={template.id}
              active={brush?.kind === "template" && brush.templateId === template.id}
              onClick={() => toggleBrush({ kind: "template", templateId: template.id })}
              className={DAY_COLOR_FILL[template.color]}
            >
              <span className="font-medium">{templateDisplayName(template)}</span>
              {template.name ? <span className="text-xs text-text-main/70">{templateHoursLabel(template)}</span> : null}
            </BrushChip>
          ))}
          <BrushChip
            active={brush?.kind === "off"}
            onClick={() => toggleBrush({ kind: "off" })}
            className="border-dashed text-text-sec"
          >
            {T.offBrush}
          </BrushChip>
          <BrushChip active={brush?.kind === "reset"} onClick={() => toggleBrush({ kind: "reset" })} className="text-text-sec">
            <RotateCcw className="h-4 w-4" aria-hidden />
            {T.resetBrush}
          </BrushChip>
          {requestMode ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 rounded-xl"
              onClick={() => setPaletteOpen("create")}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              {T.addDayCta}
            </Button>
          )}
        </div>
        <p className="text-xs text-text-sec">
          {brushName ? T.brushHint(brushName) : requestMode ? T.requestHint : T.hint}
        </p>
      </div>

      {requestMode && pending && pendingNotEmpty ? (
        <div
          className="flex items-start gap-2 rounded-2xl border border-info-border bg-info-surface px-4 py-3"
          data-testid="schedule-calendar-request"
        >
          <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-info-text" aria-hidden />
          <p className="text-sm text-info-text">
            {T.requestSummary(pending.days.length, pending.hasPattern, pending.hasWeek)}
          </p>
        </div>
      ) : null}

      {keptBookings ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning-border bg-warning-surface px-4 py-3">
          <p className="text-sm text-warning-text">{T.keptBookingsNotice}</p>
          <Button type="button" variant="secondary" size="sm" className="rounded-xl" onClick={() => setKeptBookings(false)}>
            {T.dismiss}
          </Button>
        </div>
      ) : null}
      {saveError ? <p className="text-sm text-danger-text">{saveError}</p> : null}

      <div className="rounded-2xl border border-border-subtle bg-bg-card p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="icon"
            size="icon"
            aria-label={T.prevMonthAria}
            disabled={offset === 0}
            onClick={() => setMonthOffset(Math.max(0, offset - 1))}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </Button>
          <p className="font-display text-base text-text-main lg:hidden">
            {shownMonths[0] ? `${MONTHS[shownMonths[0].month - 1]} ${shownMonths[0].year}` : ""}
          </p>
          <Button
            type="button"
            variant="icon"
            size="icon"
            aria-label={T.nextMonthAria}
            disabled={offset >= maxOffset}
            onClick={() => setMonthOffset(Math.min(maxOffset, offset + 1))}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Button>
        </div>

        {!calendar ? (
          <div className="h-72 animate-pulse rounded-xl bg-bg-input" aria-hidden />
        ) : (
          <div className="grid gap-6 lg:grid-cols-3" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {shownMonths.map((grid) => (
              <div key={grid.key} className="space-y-2">
                <p className="hidden font-display text-base text-text-main lg:block">
                  {`${MONTHS[grid.month - 1]} ${grid.year}`}
                </p>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAY_SHORT.map((label) => (
                    <span key={label} className="pb-1 text-center text-[11px] font-medium uppercase text-text-sec">
                      {label}
                    </span>
                  ))}
                  {grid.cells.map((day, index) =>
                    day ? (
                      <DayCell
                        key={day.date}
                        day={day}
                        studioDay={calendar.studio?.days[day.date] ?? null}
                        today={day.date === calendar.todayKey}
                        template={day.templateId ? templatesById.get(day.templateId) : undefined}
                        pending={Boolean(overlay[day.date])}
                        requested={requestMode && requested.has(day.date)}
                        onClick={() => onDayClick(day)}
                      />
                    ) : (
                      <span key={`${grid.key}-pad-${index}`} aria-hidden />
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-sec">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full bg-accent-text" />
            {T.legendPainted}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="rounded-full bg-bg-input px-1.5 text-[10px] font-medium text-text-main">2</span>
            {T.legendBookings}
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded border border-dashed border-border-subtle" />
            {T.legendOff}
          </span>
          {calendar?.studio ? (
            <span className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-text-sec" aria-hidden />
              {T.legendStudio(calendar.studio.name)}
            </span>
          ) : null}
          {requestMode ? (
            <span className="flex items-center gap-1.5">
              <Hourglass className="h-3.5 w-3.5 text-info-text" aria-hidden />
              {T.legendRequested}
            </span>
          ) : null}
        </div>
      </div>

      {openDay ? (
        <CalendarDaySheet
          key={openDay.date}
          day={openDay}
          studio={
            calendar?.studio && calendar.studio.days[openDay.date]
              ? { name: calendar.studio.name, day: calendar.studio.days[openDay.date]! }
              : null
          }
          templates={templates}
          request={
            requestMode
              ? {
                  action: requested.get(openDay.date) ?? null,
                  onWithdraw: () => {
                    paint([openDay.date], { kind: "withdraw" });
                    setOpenDate(null);
                  },
                }
              : null
          }
          onClose={() => setOpenDate(null)}
          onPaint={(action) => {
            paint([openDay.date], action);
            setOpenDate(null);
          }}
        />
      ) : null}

      {paletteOpen ? (
        <PaletteModal
          open
          onClose={() => setPaletteOpen(null)}
          templates={templates}
          paletteEndpoint={paletteEndpoint}
          startWithCreate={paletteOpen === "create"}
          onSnapshot={onSnapshot}
          onCreated={(templateId) => setBrush({ kind: "template", templateId })}
        />
      ) : null}
    </section>
  );
}

function BrushChip({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
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
        "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm text-text-main transition-shadow",
        active ? "border-primary ring-2 ring-primary/40" : "border-border-subtle",
        className,
      )}
    >
      {children}
    </Button>
  );
}

function DayCell({
  day,
  studioDay,
  today,
  template,
  pending,
  requested,
  onClick,
}: {
  day: CalendarDayDto;
  /** Рабочий день того же человека в студии (только для чтения). */
  studioDay: CalendarStudioDayDto | null;
  today: boolean;
  template: DayTemplateDto | undefined;
  pending: boolean;
  /** День в заявке студии: клетка показывает его таким, каким он станет. */
  requested: boolean;
  onClick: () => void;
}) {
  const number = Number(day.date.slice(8, 10));
  const hours = day.isWorking ? (day.fixed ? T.fixedLabel : `${compactHour(day.start)}–${compactHour(day.end)}`) : "";
  const parts = [
    formatCalendarDate(day.date),
    today ? T.todayAria : null,
    day.isWorking ? (template ? templateDisplayName(template) : hours) : T.dayOffAria,
    day.painted ? T.paintedAria : null,
    requested ? T.requestedAria : null,
    day.bookings > 0 ? T.bookingsAria(day.bookings) : null,
    studioDay ? T.studioDayAria(studioHoursLabel(studioDay)) : null,
  ].filter(Boolean);

  return (
    <Button
      type="button"
      variant="wrapper"
      size="none"
      disabled={day.beyond}
      aria-label={parts.join(", ")}
      data-testid="schedule-calendar-day"
      data-date={day.date}
      data-requested={requested ? "true" : undefined}
      onClick={onClick}
      className={cn(
        "relative flex min-h-11 flex-col items-start justify-between rounded-lg p-1 text-left text-xs transition-opacity sm:min-h-16 sm:p-1.5",
        day.isWorking
          ? template
            ? DAY_COLOR_FILL[template.color]
            : "bg-bg-input ring-1 ring-inset ring-border-subtle"
          : "border border-dashed border-border-subtle",
        day.past && "opacity-50",
        day.beyond && "cursor-default opacity-30",
        today && "ring-2 ring-primary",
        pending && "opacity-70",
      )}
    >
      <span className="flex w-full items-start justify-between gap-1">
        <span className={cn("font-medium", day.isWorking ? "text-text-main" : "text-text-sec")}>{number}</span>
        <span className="flex shrink-0 items-center gap-0.5">
          {requested ? <Hourglass aria-hidden className="h-3 w-3 text-info-text" /> : null}
          {studioDay ? <Building2 aria-hidden className="h-3 w-3 text-text-sec" /> : null}
          {day.painted ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent-text" /> : null}
          {day.bookings > 0 ? (
            <span
              aria-hidden
              className="rounded-full bg-bg-card px-1 text-[10px] font-medium leading-4 text-text-main"
            >
              {day.bookings}
            </span>
          ) : null}
        </span>
      </span>
      <span className="hidden w-full truncate text-[10px] leading-tight text-text-main/80 sm:block">{hours}</span>
    </Button>
  );
}

/** Часы дня в студии подписью: «10–19» или «фикс. время». */
function studioHoursLabel(day: CalendarStudioDayDto): string {
  return day.fixed ? T.fixedLabel : `${compactHour(day.start)}–${compactHour(day.end)}`;
}
