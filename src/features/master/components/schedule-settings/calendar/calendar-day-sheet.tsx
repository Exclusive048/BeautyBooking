"use client";

import { useState } from "react";
import { Building2, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import type { CalendarDayDto, CalendarPaintAction, CalendarStudioDayDto } from "@/lib/schedule/calendar-shared";
import type { DayTemplateDto } from "@/lib/schedule/patterns-shared";
import * as UI_TEXT from "@/lib/ui/text";
import { cn } from "@/lib/cn";
import { DayHoursEditor } from "../plan/day-hours-editor";
import { DEFAULT_DAY_HOURS, validateDayHours, type DayHoursDraft } from "../plan/lib/day-hours";
import { WEEKDAY_SHORT, weekdayIndex } from "../plan/lib/describe-plan";
import { DAY_COLOR_FILL } from "./lib/calendar-grid";
import { templateDisplayName, templateHoursLabel } from "./lib/template-label";

const T = UI_TEXT.cabinetMaster.scheduleSettings.calendar;
const MONTHS_GENITIVE = UI_TEXT.publicProfile.bookingFlow.monthsGenitive;

/** «Пт, 3 октября» — дата салона без пояса. */
export function formatCalendarDate(dateKey: string): string {
  const month = MONTHS_GENITIVE[Number(dateKey.slice(5, 7)) - 1] ?? "";
  return `${WEEKDAY_SHORT[weekdayIndex(dateKey)]}, ${Number(dateKey.slice(8, 10))} ${month}`;
}

/**
 * SCHEDULE-PATTERNS-01 (этап 3) — шторка дня календаря: что стоит в этот
 * день, сколько записей, и чем его заменить (рабочий день палитры, выходной,
 * свои часы, «как по графику»). Записи на ставшем выходным дне остаются —
 * решение владельца.
 *
 * Профиль в студии (`request`): день показан как он есть сейчас, а то, что
 * мастер уже отправил студии, — отдельной строкой с «Убрать из заявки».
 */
export function CalendarDaySheet({
  day,
  studio = null,
  templates,
  request = null,
  onClose,
  onPaint,
}: {
  day: CalendarDayDto;
  /** Этап 4: этот день человек работает в студии — строкой, только для чтения. */
  studio?: { name: string; day: CalendarStudioDayDto } | null;
  templates: DayTemplateDto[];
  /** Режим заявки: что по этой дате уже в заявке студии (`null` — ничего). */
  request?: { action: CalendarPaintAction | null; onWithdraw: () => void } | null;
  onClose: () => void;
  onPaint: (action: CalendarPaintAction) => void;
}) {
  const [ownHoursOpen, setOwnHoursOpen] = useState(false);
  const [hours, setHours] = useState<DayHoursDraft>(() => ({
    ...DEFAULT_DAY_HOURS,
    startTime: day.isWorking && !day.fixed && day.start ? day.start : DEFAULT_DAY_HOURS.startTime,
    endTime: day.isWorking && !day.fixed && day.end ? day.end : DEFAULT_DAY_HOURS.endTime,
  }));
  const editable = !day.past && !day.beyond;
  const current = day.templateId ? templates.find((item) => item.id === day.templateId) : undefined;
  const palette = templates.filter((item) => item.inPalette);
  const hoursError = validateDayHours({ ...hours, mode: "FLEXIBLE" });

  const status = !day.isWorking
    ? T.sheet.offLabel
    : current
      ? `${templateDisplayName(current)}${current.name ? ` · ${templateHoursLabel(current)}` : ""}`
      : day.fixed
        ? T.fixedLabel
        : T.customHours(day.start ?? "", day.end ?? "");

  return (
    <ModalSurface open onClose={onClose} header={{ title: formatCalendarDate(day.date) }} size="md">
      <div className="space-y-5">
        <div className="space-y-1 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-text-sec">
            {day.painted ? T.sheet.paintedLabel : T.sheet.byScheduleLabel}
          </p>
          <p className="text-sm font-medium text-text-main">{status}</p>
          {day.bookings > 0 ? <p className="text-xs text-text-sec">{T.sheet.bookingsLabel(day.bookings)}</p> : null}
        </div>

        {request?.action ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-info-border bg-info-surface px-4 py-3">
            <div className="flex items-start gap-2">
              <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-info-text" aria-hidden />
              <div className="space-y-0.5">
                <p className="text-xs font-medium uppercase tracking-wide text-info-text">{T.sheet.requestedLabel}</p>
                <p className="text-sm font-medium text-text-main">{describeAction(request.action, templates)}</p>
              </div>
            </div>
            <Button type="button" variant="secondary" size="sm" className="rounded-xl" onClick={request.onWithdraw}>
              {T.sheet.withdrawCta}
            </Button>
          </div>
        ) : null}

        {studio ? (
          <p className="flex items-start gap-2 rounded-2xl border border-border-subtle px-4 py-3 text-sm text-text-sec">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {T.sheet.studioLine(
              studio.name,
              studio.day.fixed ? T.fixedLabel : T.customHours(studio.day.start ?? "", studio.day.end ?? ""),
            )}
          </p>
        ) : null}

        {editable ? (
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-text-sec">{T.sheet.chooseLabel}</p>
            <div className="flex flex-wrap gap-2">
              {palette.map((template) => (
                <Button
                  key={template.id}
                  type="button"
                  variant="wrapper"
                  size="none"
                  aria-pressed={day.isWorking && day.templateId === template.id}
                  onClick={() => onPaint({ kind: "template", templateId: template.id })}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm text-text-main",
                    DAY_COLOR_FILL[template.color],
                    day.isWorking && day.templateId === template.id ? "border-primary" : "border-transparent",
                  )}
                >
                  <span className="font-medium">{templateDisplayName(template)}</span>
                  {template.name ? <span className="text-xs text-text-main/70">{templateHoursLabel(template)}</span> : null}
                </Button>
              ))}
              <Button
                type="button"
                variant="wrapper"
                size="none"
                aria-pressed={!day.isWorking}
                onClick={() => onPaint({ kind: "off" })}
                className={cn(
                  "flex min-h-11 items-center rounded-xl border border-dashed px-3 text-sm text-text-sec",
                  !day.isWorking ? "border-primary" : "border-border-subtle",
                )}
              >
                {T.offBrush}
              </Button>
            </div>

            {ownHoursOpen ? (
              <div className="space-y-3 rounded-2xl border border-border-subtle p-3">
                <DayHoursEditor compact value={hours} onChange={setHours} />
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  className="rounded-xl"
                  disabled={Boolean(hoursError)}
                  onClick={() =>
                    onPaint({
                      kind: "hours",
                      startTime: hours.startTime,
                      endTime: hours.endTime,
                      breaks: hours.breakOn ? [{ start: hours.breakStart, end: hours.breakEnd, title: null }] : [],
                    })
                  }
                >
                  {T.sheet.applyHoursCta}
                </Button>
              </div>
            ) : (
              <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={() => setOwnHoursOpen(true)}>
                {T.sheet.ownHoursCta}
              </Button>
            )}

            {day.painted ? (
              <Button type="button" variant="secondary" size="md" className="rounded-xl" onClick={() => onPaint({ kind: "reset" })}>
                {T.sheet.resetCta}
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-text-sec">{T.sheet.pastHint}</p>
        )}
      </div>
    </ModalSurface>
  );
}

/** Действие заявки подписью: «Утро · 09:00–15:00», «Выходной», «10:00–19:00», «Как по графику». */
function describeAction(action: CalendarPaintAction, templates: readonly DayTemplateDto[]): string {
  if (action.kind === "off") return T.offBrush;
  if (action.kind === "reset") return T.resetBrush;
  if (action.kind === "hours") {
    return action.fixedSlotTimes && action.fixedSlotTimes.length > 0
      ? T.fixedLabel
      : T.customHours(action.startTime, action.endTime);
  }
  const template = templates.find((item) => item.id === action.templateId);
  if (!template) return T.palette.untitled;
  return template.name ? `${templateDisplayName(template)} · ${templateHoursLabel(template)}` : templateHoursLabel(template);
}
