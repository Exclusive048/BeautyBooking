"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { isScheduleEndingSoon } from "@/lib/schedule/calendar-shared";
import type { ScheduleEditorSnapshot } from "@/lib/schedule/editor-shared";
import { SCHEDULE_HORIZON_DAYS } from "@/lib/schedule/publish-horizon";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { useOptionalSaveStatus } from "../save-status-provider";
import { dateKeyIso, isManualPattern, summarizePattern } from "./lib/describe-plan";
import { ScheduleWizard, type WizardAppliedInfo } from "./schedule-wizard";

const T = UI_TEXT.cabinetMaster.scheduleSettings.plan;

type Props = {
  snapshot: ScheduleEditorSnapshot;
  /** `…/schedule/pattern` с параметрами профиля. */
  patternEndpoint: string;
  previewEndpoint: string;
  /**
   * Расписание профиля в студии: график меняется заявкой студии (этап 4) —
   * окно отправляет его на одобрение, дату окончания отдельно не правят.
   */
  requestMode: boolean;
  onSnapshot: (snapshot: ScheduleEditorSnapshot) => void;
  /** Окно применило график (например, «отмечу дни сам» — пора в календарь). */
  onWizardApplied?: (info: WizardAppliedInfo, snapshot: ScheduleEditorSnapshot) => void;
};

function formatDateKey(dateKey: string): string {
  // Ключ даты салона — календарная дата без пояса, поэтому подпись в UTC.
  return UI_FMT.dateShort(dateKeyIso(dateKey), { timeZone: "UTC" });
}

/**
 * SCHEDULE-PATTERNS-01 (этап 2) — график мастера над вкладками настроек:
 * что действует сейчас, что запланировано дальше, до какого дня настроено
 * (или «продлевать автоматически») и вход в пошаговое окно.
 */
export function SchedulePlanCard({
  snapshot,
  patternEndpoint,
  previewEndpoint,
  requestMode,
  onSnapshot,
  onWizardApplied,
}: Props) {
  const plan = snapshot.schedulePlan;
  const saveStatus = useOptionalSaveStatus();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const lastKey = addDaysToDateKey(plan.todayKey, SCHEDULE_HORIZON_DAYS);
  const autoExtend = plan.hasSchedule && plan.configuredUntil === null;

  const saveEnd = async (endsOn: string | null) => {
    setError(null);
    saveStatus?.setStatus("saving");
    try {
      const data = await fetchJson<{ snapshot: ScheduleEditorSnapshot }>(patternEndpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endsOn }),
      });
      saveStatus?.setStatus("saved");
      onSnapshot(data.snapshot);
    } catch (caught) {
      const message = serverMessageOr(caught, T.saveError);
      setError(message);
      saveStatus?.setErrorMessage(message);
      saveStatus?.setStatus("error");
    }
  };

  const nextStart = plan.upcoming[0]?.startsOn ?? null;
  // Расписание кончается в ближайшие дни, а автопродление выключено — после
  // конца клиенты не увидят окошек (решение владельца: настроено «на сколько
  // настроил»). То же окно, что у напоминания (`schedule-ending.ts`) и плашки
  // на главной кабинета.
  const endingSoon = isScheduleEndingSoon(plan);

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-4 md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-sec">
            <CalendarRange className="h-4 w-4" aria-hidden />
            {T.title}
          </div>
          {plan.current ? (
            <>
              <p className="font-display text-lg text-text-main">
                {summarizePattern(plan.current, plan.templates)}
              </p>
              {isManualPattern(plan.current) ? <p className="text-sm text-text-sec">{T.manualHint}</p> : null}
            </>
          ) : (
            <>
              <p className="font-display text-lg text-text-main">{T.noneTitle}</p>
              <p className="text-sm text-text-sec">
                {nextStart ? T.notStartedHint(formatDateKey(nextStart)) : T.noneHint}
              </p>
            </>
          )}
          {plan.upcoming.map((period) =>
            period.startsOn ? (
              <p key={period.startsOn} className="text-sm text-text-sec">
                {T.upcomingLabel(formatDateKey(period.startsOn), summarizePattern(period, plan.templates))}
              </p>
            ) : null,
          )}
          {plan.hasSchedule && plan.configuredUntil ? (
            endingSoon ? (
              <p className="rounded-xl border border-warning-border bg-warning-surface px-3 py-2 text-sm text-warning-text">
                {T.endingSoonHint(formatDateKey(plan.configuredUntil))}
              </p>
            ) : (
              <p className="text-sm text-text-sec">{T.untilLabel(formatDateKey(plan.configuredUntil))}</p>
            )
          ) : null}
          {requestMode ? <p className="text-sm text-text-sec">{T.studioProfileHint}</p> : null}
          {requestSent ? (
            <p className="rounded-xl border border-success-border bg-success-surface px-3 py-2 text-sm text-success-text">
              {T.requestSent}
            </p>
          ) : null}
        </div>

        <Button
          type="button"
          variant="primary"
          size="md"
          className="shrink-0 rounded-xl"
          onClick={() => setWizardOpen(true)}
          data-guide="schedule"
        >
          {requestMode ? T.proposeCta : T.setupCta}
        </Button>
      </div>

      {!requestMode && plan.hasSchedule ? (
        <div className="mt-4 space-y-3 border-t border-border-subtle pt-4">
          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-medium text-text-main">{T.autoExtendLabel}</span>
              <span className="block text-xs text-text-sec">{T.autoExtendHint}</span>
            </span>
            <Switch
              checked={autoExtend}
              onCheckedChange={(next) => void saveEnd(next ? null : lastKey)}
              aria-label={T.autoExtendLabel}
            />
          </label>
          {!autoExtend && plan.configuredUntil ? (
            <label className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-text-main">{T.endDateLabel}</span>
              <Input
                type="date"
                min={plan.todayKey}
                max={lastKey}
                value={plan.configuredUntil}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value && value !== plan.configuredUntil) void saveEnd(value);
                }}
                className="h-11 w-auto rounded-xl px-3 text-sm"
              />
            </label>
          ) : null}
          {error ? <p className="text-sm text-danger-text">{error}</p> : null}
        </div>
      ) : null}

      {wizardOpen ? (
        <ScheduleWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          plan={plan}
          timezone={snapshot.timezone}
          patternEndpoint={patternEndpoint}
          previewEndpoint={previewEndpoint}
          requestMode={requestMode}
          onApplied={(next, info) => {
            setWizardOpen(false);
            if (info.requested) {
              setRequestSent(true);
              return;
            }
            onSnapshot(next);
            onWizardApplied?.(info, next);
          }}
        />
      ) : null}
    </section>
  );
}
