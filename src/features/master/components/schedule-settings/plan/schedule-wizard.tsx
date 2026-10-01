"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, PenLine, Repeat, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Switch } from "@/components/ui/switch";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import type { ScheduleEditorSnapshot } from "@/lib/schedule/editor-shared";
import {
  CYCLE_PRESETS,
  MAX_PATTERN_CYCLE_DAYS,
  mondayOfWeekKey,
  patternPosition,
  type DayTemplateDto,
  type SchedulePlanDto,
} from "@/lib/schedule/patterns-shared";
import { SCHEDULE_HORIZON_DAYS } from "@/lib/schedule/publish-horizon";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { formatZoneLabel } from "@/lib/ui/zone-label";
import { cn } from "@/lib/cn";
import { ChipGroup } from "@/components/ui/chip-group";
import { ModeCard } from "@/components/ui/mode-card";
import { DayHoursEditor, ScheduleField as Field } from "./day-hours-editor";
import {
  buildPatternTemplates,
  dayHoursToTemplate,
  validateDayHours,
  type DayHoursDraft,
  type DayTemplateRequest,
} from "./lib/day-hours";
import { compactHour } from "../calendar/lib/calendar-grid";
import { initialDraft, WORKDAYS_MASK, type WizardHoursMode, type WizardKind } from "./lib/initial-draft";
import {
  WEEKDAY_SHORT,
  previewPatternDays,
  summarizePattern,
  weekdayIndex,
} from "./lib/describe-plan";

const T = UI_TEXT.cabinetMaster.scheduleSettings.wizard;
const PLAN_T = UI_TEXT.cabinetMaster.scheduleSettings.plan;

type Kind = WizardKind;
type StepId = "kind" | "days" | "hours" | "review";
type HoursMode = WizardHoursMode;

type Conflict = {
  bookingId: string;
  startAtUtc: string;
  endAtUtc: string;
  clientName: string | null;
  reason: "DAY_OFF" | "OUTSIDE_HOURS";
};

export type WizardAppliedInfo = {
  manual: boolean;
  /** Профиль в студии: график не записан, а отправлен студии заявкой (этап 4). */
  requested: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  plan: SchedulePlanDto;
  timezone: string;
  /** `…/schedule/pattern` с параметрами профиля (см. `schedulePatternEndpoint`). */
  patternEndpoint: string;
  previewEndpoint: string;
  /**
   * Профиль в студии (этап 4): окно не пишет график, а отправляет его студии
   * заявкой. «Отмечу дни сам» здесь недоступно — дни в календаре профиля в
   * студии отмечает администратор студии.
   */
  requestMode?: boolean;
  onApplied: (snapshot: ScheduleEditorSnapshot, info: WizardAppliedInfo) => void;
};


/**
 * SCHEDULE-PATTERNS-01 — пошаговое окно «Настроить график»: как вы работаете
 * → рабочие дни → часы → когда → проверка.
 *
 * Решения владельца 2026-09-28: «график» — это чередование; расписание
 * действует ровно до даты, которую настроили (не дальше 3 месяцев),
 * автопродление по умолчанию выключено; записи на новых выходных НЕ
 * отменяются — окно их только показывает.
 *
 * Этап 3: часы бывают разными по дням (одинаковые часы — один рабочий день
 * палитры), и есть режим «Каждый раз по-разному» — график без рабочих дней и
 * один рабочий день в палитре, которым дни отмечаются в календаре.
 *
 * Даты в окне — даты салона (`plan.todayKey`), время записей — пояс салона
 * с меткой зоны (rule 17).
 */
export function ScheduleWizard({
  open,
  onClose,
  plan,
  timezone,
  patternEndpoint,
  previewEndpoint,
  requestMode = false,
  onApplied,
}: Props) {
  const todayKey = plan.todayKey;
  const lastKey = addDaysToDateKey(todayKey, SCHEDULE_HORIZON_DAYS);
  const initial = useMemo(() => initialDraft(plan), [plan]);

  const [stepIndex, setStepIndex] = useState(0);
  const [kind, setKind] = useState<Kind>(requestMode && initial.kind === "MANUAL" ? "WEEK" : initial.kind);
  const [weekDays, setWeekDays] = useState<boolean[]>(initial.weekDays);
  const [cyclePreset, setCyclePreset] = useState<string>(initial.cyclePreset);
  const [work, setWork] = useState(initial.work);
  const [off, setOff] = useState(initial.off);
  const [firstDay, setFirstDay] = useState(initial.firstDay);
  const [weeksCount, setWeeksCount] = useState(initial.weeksCount);
  const [weeksDays, setWeeksDays] = useState<boolean[]>(initial.weeksDays);
  const [currentWeek, setCurrentWeek] = useState(initial.currentWeek);
  const [hoursMode, setHoursMode] = useState<HoursMode>(initial.hoursMode);
  const [sameHours, setSameHours] = useState<DayHoursDraft>(initial.sameHours);
  // Часы по дням — по виду графика и позиции: у недели позиция 0 — понедельник,
  // у «2 через 2» — первый рабочий день, и переносить одно в другое нельзя.
  const [perDay, setPerDay] = useState<Record<string, DayHoursDraft>>(initial.perDay);
  const [startsOn, setStartsOn] = useState(todayKey);
  const [autoExtend, setAutoExtend] = useState(initial.autoExtend);
  const [endsOn, setEndsOn] = useState(initial.endsOn);
  const [resumePrevious, setResumePrevious] = useState(false);
  // Быстрый выбор на первом шаге («5/2», «2 через 2»…): дни уже заданы,
  // шаг «Рабочие дни» пропускается, первый рабочий день «N через M» — на
  // последнем шаге.
  const [quick, setQuick] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const manual = kind === "MANUAL";
  // Сроки («с какого дня», «до какого», автопродление) — на последнем шаге
  // рядом с проверкой: значения по умолчанию подходят почти всем, и отдельный
  // шаг был лишним «Далее» (живая проверка 2026-09-28: 5 шагов на «5/2»).
  const steps: StepId[] = manual || quick ? ["kind", "hours", "review"] : ["kind", "days", "hours", "review"];
  const step = steps[Math.min(stepIndex, steps.length - 1)]!;

  const workMask: boolean[] = useMemo(() => {
    if (kind === "WEEK") return weekDays;
    if (kind === "WEEKS") return weeksDays.slice(0, weeksCount * 7);
    if (kind === "CYCLE") return [...Array.from({ length: work }, () => true), ...Array.from({ length: off }, () => false)];
    return [false];
  }, [kind, weekDays, weeksDays, weeksCount, work, off]);

  const workingPositions = workMask.flatMap((on, index) => (on ? [index] : []));
  const perDayActive = !manual && hoursMode === "perDay" && workingPositions.length > 1;
  const flexibleDefault: DayHoursDraft = { ...sameHours, mode: "FLEXIBLE" };
  const hoursFor = (position: number): DayHoursDraft => perDay[`${kind}:${position}`] ?? flexibleDefault;

  const built = buildPatternTemplates(
    workMask.map((on, position) => (on ? (perDayActive ? hoursFor(position) : sameHours) : null)),
  );

  const anchorOn =
    kind === "CYCLE"
      ? firstDay
      : kind === "WEEKS"
        ? addDaysToDateKey(mondayOfWeekKey(todayKey), -(currentWeek - 1) * 7)
        : kind === "MANUAL"
          ? startsOn
          : mondayOfWeekKey(startsOn);

  const templates: Array<DayTemplateRequest & { label?: string; color?: string }> = manual
    ? [{ ...dayHoursToTemplate(sameHours), label: T.hours.manualDayLabel, color: "1" }]
    : built.templates;
  const patternDays: Array<number | null> = manual ? [null] : built.days;

  const request = {
    templates,
    pattern: {
      kind: manual ? "CYCLE" : kind,
      cycleDays: patternDays.length,
      anchorOn,
      startsOn,
      endsOn: autoExtend ? null : endsOn,
      days: patternDays,
      resumePrevious: !autoExtend && resumePrevious,
    },
  };

  const stepError = validateStep(step, {
    kind,
    workMask,
    work,
    off,
    sameHours,
    perDayActive,
    workingPositions,
    hoursFor,
    startsOn,
    endsOn,
    autoExtend,
    todayKey,
    lastKey,
  });

  // Часы «по дням», которые у выбранных дней совпадают, — это одни часы.
  const collapseHoursFor = (nextKind: Kind, mask: boolean[]) => {
    if (hoursMode !== "perDay") return;
    const drafts = mask.flatMap((on, position) =>
      on ? [perDay[`${nextKind}:${position}`] ?? flexibleDefault] : [],
    );
    if (drafts.length === 0) return;
    const first = JSON.stringify(drafts[0]);
    if (drafts.every((draft) => JSON.stringify(draft) === first)) {
      setSameHours(drafts[0]!);
      setHoursMode("same");
    }
  };

  const pickQuick = (preset: QuickPreset) => {
    if (preset.kind === "WEEK") {
      const mask = weekMaskOf(preset.week);
      setKind("WEEK");
      setWeekDays(mask);
      collapseHoursFor("WEEK", mask);
    } else {
      const found = CYCLE_PRESETS.find((item) => item.id === preset.cycle) ?? CYCLE_PRESETS[0]!;
      setKind("CYCLE");
      setCyclePreset(found.id);
      setWork(found.work);
      setOff(found.off);
      // Тот же «N через M», что уже действует, — раскладку не сдвигаем.
      if (!(initial.kind === "CYCLE" && initial.work === found.work && initial.off === found.off)) {
        setFirstDay(todayKey);
      }
      collapseHoursFor("CYCLE", [
        ...Array.from({ length: found.work }, () => true),
        ...Array.from({ length: found.off }, () => false),
      ]);
    }
    setQuick(true);
    setStartsOn(todayKey);
    setStepIndex(1);
  };

  const quickActive = (preset: QuickPreset): boolean =>
    quick &&
    (preset.kind === "WEEK"
      ? kind === "WEEK" && weekPresetOf(weekDays) === preset.week
      : kind === "CYCLE" && cyclePreset === preset.cycle);

  const pickKind = (next: Kind) => {
    setKind(next);
    setQuick(false);
  };

  const goNext = async () => {
    if (stepError) return;
    const nextIndex = stepIndex + 1;
    setStepIndex(nextIndex);
    // Пять одинаковых редакторов подряд только путают (например, после
    // «Пн–Сб с короткой субботой» выбрали «Пн–Пт»).
    if (steps[nextIndex] === "hours") collapseHoursFor(kind, workMask);
  };

  // Записи на новых выходных: проверяются при входе на последний шаг и заново,
  // когда там меняют сроки. Ответ устаревшего запроса отбрасывается.
  const checkRun = useRef(0);
  const requestBody = JSON.stringify(request);
  useEffect(() => {
    if (step !== "review" || manual) return;
    const run = ++checkRun.current;
    setChecking(true);
    setCheckError(null);
    const timer = setTimeout(async () => {
      try {
        const data = await fetchJson<{ conflicts: Conflict[] }>(previewEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        });
        if (run === checkRun.current) setConflicts(data.conflicts);
      } catch (error) {
        if (run === checkRun.current) setCheckError(serverMessageOr(error, T.review.checkError));
      } finally {
        if (run === checkRun.current) setChecking(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [step, manual, previewEndpoint, requestBody]);

  const apply = async () => {
    setApplying(true);
    setApplyError(null);
    try {
      const data = await fetchJson<{ snapshot: ScheduleEditorSnapshot; conflicts: Conflict[] }>(patternEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      onApplied(data.snapshot, { manual, requested: requestMode });
    } catch (error) {
      setApplyError(serverMessageOr(error, T.applyError));
    } finally {
      setApplying(false);
    }
  };

  const isLast = stepIndex >= steps.length - 1;
  const footer = (
    <div className="flex items-center justify-between gap-2">
      {stepIndex > 0 ? (
        <Button
          type="button"
          variant="secondary"
          size="md"
          className="rounded-xl"
          onClick={() => setStepIndex(stepIndex - 1)}
          disabled={applying}
        >
          {T.back}
        </Button>
      ) : (
        <span aria-hidden />
      )}
      {!isLast ? (
        <Button type="button" variant="primary" size="md" className="rounded-xl" onClick={goNext} disabled={Boolean(stepError)}>
          {T.next}
        </Button>
      ) : (
        <Button
          type="button"
          variant="primary"
          size="md"
          className="rounded-xl"
          onClick={apply}
          disabled={applying || checking || Boolean(stepError)}
        >
          {applying ? T.applying : requestMode ? T.sendRequest : T.apply}
        </Button>
      )}
    </div>
  );

  const previewDays = previewPatternDays({
    anchorOn,
    days: patternDays,
    fromKey: startsOn,
    count: 14,
    endsOn: autoExtend ? null : endsOn,
  });

  // Часы рабочего дня коротко («10–20», «фикс.») — в предпросмотре «Проверьте».
  const hoursLabelOn = (dateKey: string): string | null => {
    const index = patternDays[patternPosition(dateKey, anchorOn, patternDays.length)];
    const template = index === null || index === undefined ? undefined : templates[index];
    if (!template) return null;
    return template.scheduleMode === "FIXED"
      ? T.review.fixedShort
      : `${compactHour(template.startTime)}–${compactHour(template.endTime)}`;
  };

  const positionLabel = (position: number): string => {
    if (kind === "WEEK") return WEEKDAY_SHORT[position] ?? "";
    if (kind === "WEEKS") return T.hours.weekDayLabel(Math.floor(position / 7) + 1, WEEKDAY_SHORT[position % 7] ?? "");
    return T.hours.dayLabel(position + 1);
  };

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      header={{ title: T.title, subtitle: T.stepLabel(stepIndex + 1, steps.length) }}
      footer={footer}
      stickyFooter
      size="lg"
    >
      <div className="space-y-5">
        {step === "kind" ? (
          <Section title={T.kind.title}>
            <div className="space-y-2" data-testid="schedule-wizard-quick">
              <p className="text-xs font-medium uppercase tracking-wide text-text-sec">{T.kind.quickTitle}</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant="wrapper"
                    size="none"
                    aria-pressed={quickActive(preset)}
                    onClick={() => pickQuick(preset)}
                    className={cn(
                      "min-h-11 rounded-xl border px-4 text-sm font-medium text-text-main transition-colors hover:border-primary",
                      quickActive(preset) ? "border-primary bg-primary/10" : "border-border-subtle bg-bg-card",
                    )}
                  >
                    {quickLabel(preset)}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-text-sec">{T.kind.quickHint}</p>
            </div>
            <p className="pt-2 text-xs font-medium uppercase tracking-wide text-text-sec">{T.kind.customTitle}</p>
            <div className="grid grid-cols-1 gap-3">
              <ModeCard
                active={!quick && kind === "WEEK"}
                icon={CalendarRange}
                title={T.kind.weekTitle}
                description={T.kind.weekHint}
                onClick={() => pickKind("WEEK")}
              />
              <ModeCard
                active={!quick && kind === "CYCLE"}
                icon={Repeat}
                title={T.kind.cycleTitle}
                description={T.kind.cycleHint}
                onClick={() => pickKind("CYCLE")}
              />
              <ModeCard
                active={!quick && kind === "WEEKS"}
                icon={Rows3}
                title={T.kind.weeksTitle}
                description={T.kind.weeksHint}
                onClick={() => pickKind("WEEKS")}
              />
              {!requestMode ? (
                <ModeCard
                  active={!quick && kind === "MANUAL"}
                  icon={PenLine}
                  title={T.kind.manualTitle}
                  description={T.kind.manualHint}
                  onClick={() => pickKind("MANUAL")}
                />
              ) : null}
            </div>
          </Section>
        ) : null}

        {step === "days" ? (
          <Section title={T.days.title}>
            {kind === "WEEK" ? (
              <div className="space-y-3">
                <ChipGroup<string>
                  value={weekPresetOf(weekDays)}
                  onChange={(preset) => setWeekDays(weekMaskOf(preset))}
                  options={[
                    { value: "weekdays", label: T.days.weekdaysPreset },
                    { value: "six", label: T.days.sixDaysPreset },
                    { value: "all", label: T.days.everyDayPreset },
                  ]}
                />
                <WeekdayToggles value={weekDays} onChange={setWeekDays} />
              </div>
            ) : null}

            {kind === "CYCLE" ? (
              <div className="space-y-4">
                <ChipGroup<string>
                  value={cyclePreset}
                  onChange={(preset) => {
                    setCyclePreset(preset);
                    const found = CYCLE_PRESETS.find((item) => item.id === preset);
                    if (found) {
                      setWork(found.work);
                      setOff(found.off);
                    }
                  }}
                  options={[
                    ...CYCLE_PRESETS.map((item) => ({
                      value: item.id,
                      label: T.days.cyclePreset(item.work, item.off),
                    })),
                    { value: "custom", label: T.days.customPreset },
                  ]}
                />
                {cyclePreset === "custom" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={T.days.workDaysLabel}>
                      <Input
                        type="number"
                        min={1}
                        max={MAX_PATTERN_CYCLE_DAYS - 1}
                        value={work}
                        onChange={(event) => setWork(clampInt(event.target.value, 1, MAX_PATTERN_CYCLE_DAYS - 1))}
                        className="h-11 rounded-xl px-3 text-sm"
                      />
                    </Field>
                    <Field label={T.days.offDaysLabel}>
                      <Input
                        type="number"
                        min={1}
                        max={MAX_PATTERN_CYCLE_DAYS - 1}
                        value={off}
                        onChange={(event) => setOff(clampInt(event.target.value, 1, MAX_PATTERN_CYCLE_DAYS - 1))}
                        className="h-11 rounded-xl px-3 text-sm"
                      />
                    </Field>
                  </div>
                ) : null}
                <Field label={T.days.firstDayLabel}>
                  <Input
                    type="date"
                    min={todayKey}
                    max={lastKey}
                    value={firstDay}
                    onChange={(event) => event.target.value && setFirstDay(event.target.value)}
                    className="h-11 rounded-xl px-3 text-sm"
                  />
                </Field>
              </div>
            ) : null}

            {kind === "WEEKS" ? (
              <div className="space-y-4">
                <Field label={T.days.weeksCountLabel}>
                  <ChipGroup<number>
                    value={weeksCount}
                    onChange={(count) => {
                      setWeeksCount(count);
                      setWeeksDays((prev) =>
                        Array.from({ length: count * 7 }, (_, index) => prev[index] ?? WORKDAYS_MASK[index % 7]),
                      );
                      setCurrentWeek((week) => Math.min(week, count));
                    }}
                    options={[2, 3, 4].map((count) => ({ value: count, label: String(count) }))}
                  />
                </Field>
                {Array.from({ length: weeksCount }, (_, week) => (
                  <Field key={week} label={T.days.weekLabel(week + 1)}>
                    <WeekdayToggles
                      value={weeksDays.slice(week * 7, week * 7 + 7)}
                      onChange={(days) =>
                        setWeeksDays((prev) => {
                          const next = prev.slice();
                          days.forEach((on, index) => {
                            next[week * 7 + index] = on;
                          });
                          return next;
                        })
                      }
                    />
                  </Field>
                ))}
                <Field label={T.days.currentWeekLabel}>
                  <ChipGroup<number>
                    value={currentWeek}
                    onChange={setCurrentWeek}
                    options={Array.from({ length: weeksCount }, (_, index) => ({
                      value: index + 1,
                      label: T.days.weekLabel(index + 1),
                    }))}
                  />
                </Field>
              </div>
            ) : null}

            <DayStrip title={T.days.previewTitle} days={previewDays} />
          </Section>
        ) : null}

        {step === "hours" ? (
          <Section
            title={manual ? T.hours.manualTitle : T.hours.title}
            hint={manual ? T.hours.manualHint : perDayActive ? T.hours.perDayHint : undefined}
          >
            {!manual && workingPositions.length > 1 ? (
              <ChipGroup<HoursMode>
                value={hoursMode}
                onChange={setHoursMode}
                options={[
                  { value: "same", label: T.hours.sameForAll },
                  { value: "perDay", label: T.hours.perDay },
                ]}
              />
            ) : null}
            {perDayActive ? (
              <div className="space-y-3">
                {workingPositions.map((position) => (
                  <div key={position} className="space-y-2 rounded-2xl border border-border-subtle bg-bg-card p-3">
                    <p className="text-sm font-medium text-text-main">{positionLabel(position)}</p>
                    <DayHoursEditor
                      compact
                      value={hoursFor(position)}
                      onChange={(next) => setPerDay((prev) => ({ ...prev, [`${kind}:${position}`]: next }))}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <DayHoursEditor value={sameHours} onChange={setSameHours} />
            )}
          </Section>
        ) : null}

        {step === "review" ? (
          <Section title={T.review.title}>
            <p className="text-sm text-text-main">
              {manual ? PLAN_T.manualSummary : draftSummary(kind, patternDays, templates)}
            </p>
            <div className="space-y-3 rounded-2xl border border-border-subtle p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-text-sec">{T.period.title}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Быстрый «N через M»: одна дата — первый рабочий день (график
                    действует с сегодня, дни до него — выходные). */}
                {quick && kind === "CYCLE" ? (
                  <Field label={T.days.firstDayLabel}>
                    <Input
                      type="date"
                      min={todayKey}
                      max={lastKey}
                      value={firstDay}
                      onChange={(event) => event.target.value && setFirstDay(event.target.value)}
                      className="h-11 rounded-xl px-3 text-sm"
                    />
                  </Field>
                ) : (
                  <Field label={T.period.startLabel}>
                    <Input
                      type="date"
                      min={todayKey}
                      max={lastKey}
                      value={startsOn}
                      onChange={(event) => event.target.value && setStartsOn(event.target.value)}
                      className="h-11 rounded-xl px-3 text-sm"
                    />
                  </Field>
                )}
                {!autoExtend ? (
                  <Field label={T.period.endLabel}>
                    <Input
                      type="date"
                      min={startsOn}
                      max={lastKey}
                      value={endsOn}
                      onChange={(event) => event.target.value && setEndsOn(event.target.value)}
                      className="h-11 rounded-xl px-3 text-sm"
                    />
                  </Field>
                ) : null}
              </div>
              <label className="flex items-start justify-between gap-4 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3">
                <span>
                  <span className="block text-sm font-medium text-text-main">{T.period.autoExtendLabel}</span>
                  <span className="block text-xs text-text-sec">{T.period.autoExtendHint}</span>
                </span>
                <Switch checked={autoExtend} onCheckedChange={setAutoExtend} aria-label={T.period.autoExtendLabel} />
              </label>
              {!autoExtend ? (
                <>
                  <p className="text-xs text-text-sec">{T.period.endHint}</p>
                  {plan.hasSchedule ? (
                    <label className="flex items-start justify-between gap-4 rounded-2xl border border-border-subtle bg-bg-card px-4 py-3">
                      <span>
                        <span className="block text-sm font-medium text-text-main">{T.period.resumePreviousLabel}</span>
                        <span className="block text-xs text-text-sec">{T.period.resumePreviousHint}</span>
                      </span>
                      <Switch
                        checked={resumePrevious}
                        onCheckedChange={setResumePrevious}
                        aria-label={T.period.resumePreviousLabel}
                      />
                    </label>
                  ) : null}
                </>
              ) : null}
            </div>
            {manual ? (
              <p className="rounded-2xl border border-border-subtle bg-bg-card px-4 py-3 text-sm text-text-sec">
                {T.review.manualNote}
              </p>
            ) : (
              <>
                <DayStrip
                  title={T.review.calendarTitle}
                  days={previewPatternDays({
                    anchorOn,
                    days: patternDays,
                    fromKey: startsOn,
                    count: 28,
                    endsOn: autoExtend ? null : endsOn,
                  }).map((day) => ({ ...day, hours: day.working ? hoursLabelOn(day.dateKey) : null }))}
                />
                <div className="rounded-2xl border border-border-subtle bg-bg-card px-4 py-3 text-sm">
                  {checking ? (
                    <p className="text-text-sec">{T.review.checking}</p>
                  ) : checkError ? (
                    <p className="text-text-sec">{checkError}</p>
                  ) : conflicts && conflicts.length > 0 ? (
                    <div className="space-y-2">
                      <p className="font-medium text-text-main">{T.review.conflictsTitle(conflicts.length)}</p>
                      <ul className="space-y-1 text-text-sec">
                        {conflicts.map((conflict) => (
                          <li key={conflict.bookingId}>
                            {UI_FMT.dateTimeShort(conflict.startAtUtc, { timeZone: timezone })}
                            {" "}
                            {formatZoneLabel({ iso: conflict.startAtUtc, timeZone: timezone })}
                            {" · "}
                            {conflict.clientName ?? T.review.clientFallback}
                            {" · "}
                            {conflict.reason === "DAY_OFF" ? T.review.reasonDayOff : T.review.reasonOutsideHours}
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-text-sec">{T.review.conflictsHint}</p>
                    </div>
                  ) : (
                    <p className="text-text-sec">{T.review.noConflicts}</p>
                  )}
                </div>
              </>
            )}
            {applyError ? <p className="text-sm text-danger-text">{applyError}</p> : null}
          </Section>
        ) : null}

        {step !== "kind" && stepError ? (
          <p className="text-sm text-text-sec">{stepError}</p>
        ) : null}
      </div>
    </ModalSurface>
  );
}

// ─── Шаги: проверка ─────────────────────────────────────────────────────────

function hoursErrorText(draft: DayHoursDraft): string | null {
  const error = validateDayHours(draft);
  if (error === "noFixedTimes") return T.hours.noFixedTimes;
  if (error === "invalidRange") return T.hours.invalidRange;
  return null;
}

function validateStep(
  step: StepId,
  input: {
    kind: Kind;
    workMask: boolean[];
    work: number;
    off: number;
    sameHours: DayHoursDraft;
    perDayActive: boolean;
    workingPositions: number[];
    hoursFor: (position: number) => DayHoursDraft;
    startsOn: string;
    endsOn: string;
    autoExtend: boolean;
    todayKey: string;
    lastKey: string;
  },
): string | null {
  if (step === "days") {
    if (!input.workMask.some(Boolean)) return T.days.noWorkDays;
    if (input.kind === "CYCLE" && input.work + input.off > MAX_PATTERN_CYCLE_DAYS) return T.days.noWorkDays;
  }
  if (step === "hours") {
    if (!input.perDayActive) return hoursErrorText(input.sameHours);
    for (const position of input.workingPositions) {
      const error = hoursErrorText(input.hoursFor(position));
      if (error) return error;
    }
  }
  if (step === "review") {
    if (input.startsOn < input.todayKey || input.startsOn > input.lastKey) return T.period.endHint;
    if (!input.autoExtend && (input.endsOn < input.startsOn || input.endsOn > input.lastKey)) return T.period.endHint;
  }
  return null;
}

/** Быстрый выбор первого шага: вид графика и дни одним нажатием. */
type QuickPreset =
  | { id: string; kind: "WEEK"; week: "weekdays" | "six" | "all" }
  | { id: string; kind: "CYCLE"; cycle: string };

const QUICK_PRESETS: QuickPreset[] = [
  { id: "5-2", kind: "WEEK", week: "weekdays" },
  { id: "6-1", kind: "WEEK", week: "six" },
  { id: "all", kind: "WEEK", week: "all" },
  { id: "2x2", kind: "CYCLE", cycle: "2x2" },
  { id: "3x3", kind: "CYCLE", cycle: "3x3" },
  { id: "3x2", kind: "CYCLE", cycle: "3x2" },
];

function quickLabel(preset: QuickPreset): string {
  if (preset.kind === "WEEK") {
    return preset.week === "weekdays"
      ? T.kind.quickWeekdays
      : preset.week === "six"
        ? T.kind.quickSixDays
        : T.kind.quickEveryDay;
  }
  const found = CYCLE_PRESETS.find((item) => item.id === preset.cycle) ?? CYCLE_PRESETS[0]!;
  return T.days.cyclePreset(found.work, found.off);
}

function draftSummary(kind: Kind, days: Array<number | null>, templates: DayTemplateRequest[]): string {
  const dtos: DayTemplateDto[] = templates.map((template, index) => ({
    id: String(index),
    name: null,
    color: "1",
    startTime: template.startTime,
    endTime: template.endTime,
    breaks: template.breaks,
    scheduleMode: template.scheduleMode,
    fixedSlotTimes: template.fixedSlotTimes,
    inPalette: true,
    inUse: false,
  }));
  return summarizePattern(
    {
      kind: kind === "MANUAL" ? "CYCLE" : kind,
      cycleDays: days.length,
      anchorOn: "2024-01-01",
      startsOn: null,
      endsOn: null,
      days: days.map((day) => (day === null ? null : String(day))),
    },
    dtos,
  );
}

function weekPresetOf(days: boolean[]): string {
  const key = days.map((on) => (on ? "1" : "0")).join("");
  if (key === "1111100") return "weekdays";
  if (key === "1111110") return "six";
  if (key === "1111111") return "all";
  return "";
}

function weekMaskOf(preset: string): boolean[] {
  if (preset === "six") return [true, true, true, true, true, true, false];
  if (preset === "all") return Array.from({ length: 7 }, () => true);
  return WORKDAYS_MASK.slice();
}

function clampInt(raw: string, min: number, max: number): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

// ─── Мелкие части ────────────────────────────────────────────────────────────

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-display text-base text-text-main">{title}</h3>
        {hint ? <p className="mt-1 text-xs text-text-sec">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function WeekdayToggles({ value, onChange }: { value: boolean[]; onChange: (next: boolean[]) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {WEEKDAY_SHORT.map((label, index) => {
        const on = value[index] ?? false;
        return (
          <Button
            key={label}
            type="button"
            variant="wrapper"
            size="none"
            aria-pressed={on}
            onClick={() => onChange(value.map((item, i) => (i === index ? !item : item)))}
            className={cn(
              "h-11 rounded-xl border text-sm font-medium transition-colors",
              on
                ? "border-primary bg-primary text-white"
                : "border-border-subtle bg-bg-input text-text-sec hover:border-primary/40",
            )}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}

function DayStrip({
  title,
  days,
}: {
  title: string;
  days: Array<{ dateKey: string; working: boolean; hours?: string | null }>;
}) {
  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium uppercase tracking-wide text-text-sec">{title}</span>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => (
          <div
            key={day.dateKey}
            title={day.working ? T.days.previewWork : T.days.previewOff}
            className={cn(
              "flex flex-col items-center rounded-lg border py-1.5 text-xs",
              day.working
                ? "border-primary bg-primary/30 font-medium text-text-main"
                : "border-dashed border-border-subtle text-text-sec",
            )}
          >
            <span>{WEEKDAY_SHORT[weekdayIndex(day.dateKey)]}</span>
            <span className="font-medium">{Number(day.dateKey.slice(8, 10))}</span>
            {day.hours ? <span className="mt-0.5 text-3xs leading-tight text-text-main/80">{day.hours}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
