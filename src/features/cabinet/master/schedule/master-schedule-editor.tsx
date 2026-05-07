"use client";

/**
 * @deprecated Legacy 1488-line schedule editor. The master cabinet
 * (/cabinet/master/schedule/settings) was rebuilt in 25-SETTINGS-A on top
 * of the new tabs shell + auto-save flow under
 * `src/features/master/components/schedule-settings/`. This file lives on
 * solely because the studio cabinet calendar
 * (`src/features/studio/components/studio-calendar-page.tsx`) still mounts
 * it. Slated for deletion once the studio flow gets its own rebuild — do
 * not extend it for new functionality.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { fetchWithAuth } from "@/lib/http/fetch-with-auth";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type Break = { start: string; end: string };
type DaySchedule = {
  dayOfWeek: number;
  isWorkday: boolean;
  scheduleMode: "FLEXIBLE" | "FIXED";
  startTime: string;
  endTime: string;
  breaks: Break[];
  fixedSlotTimes: string[];
};
type ScheduleException = {
  id: string;
  date: string;
  isWorkday: boolean;
  scheduleMode: "FLEXIBLE" | "FIXED";
  startTime: string | null;
  endTime: string | null;
  breaks: Break[];
  fixedSlotTimes: string[];
};
type WeekTemplate = { id: "standard" | "2x2"; label: string };
type ApprovalInfo = {
  mode: "SOLO_MASTER" | "STUDIO_ADMIN" | "STUDIO_MASTER";
  requestStatus: "PENDING" | "REJECTED" | null;
  pendingRequestId: string | null;
  rejectedComment: string | null;
  lastAction?: "APPLIED" | "REQUEST_CREATED" | "REQUEST_UPDATED" | "NO_CHANGES";
};
type SchedulePayload = {
  timezone: string;
  weekSchedule: DaySchedule[];
  exceptions: ScheduleException[];
  templates: WeekTemplate[];
  approval?: ApprovalInfo;
};

type DayBooking = {
  id: string;
  startAtUtc: string | null;
  endAtUtc: string | null;
  status: string;
  clientName: string;
  serviceTitle: string;
  price?: number;
};

type MasterDayData = {
  date: string;
  isSolo: boolean;
  bookings: DayBooking[];
};

type DayOffConflictDetails = {
  bookings: Array<{
    id: string;
    clientName: string;
    status: string;
    timeLabel: string;
    canCancel: boolean;
  }>;
  nonCancellableCount: number;
};

type PatchError = Error & {
  code?: string;
  details?: unknown;
};

const T = UI_TEXT.cabinet.master.schedule;
const DAY_NAMES = T.dayNames;
const DAY_SHORT = T.dayShortNames;
const DEFAULT_START = "09:00";
const DEFAULT_END = "20:00";
const FIXED_START = "00:00";
const FIXED_END = "23:55";

function defaultApproval(): ApprovalInfo {
  return {
    mode: "SOLO_MASTER",
    requestStatus: null,
    pendingRequestId: null,
    rejectedComment: null,
  };
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeekMonday(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isSameMonth(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function formatRu(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("ru-RU", options).format(date);
}

function capitalize(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function toDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(date);
}

function dayIndexFromDateKey(dateKey: string): number {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 6 : day - 1;
}

function normalizeTime(raw: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw.trim());
  if (!match) return null;
  const minute = Number(match[2]);
  if (minute % 5 !== 0) return null;
  return `${match[1]}:${match[2]}`;
}

function normalizeSlots(values: string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const normalized = normalizeTime(value);
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique).sort((left, right) => left.localeCompare(right));
}

function buildDraftFromSelection(base: DaySchedule, exception: ScheduleException | null): DaySchedule {
  if (!exception) {
    return {
      ...base,
      breaks: base.breaks.map((item) => ({ ...item })),
      fixedSlotTimes: [...base.fixedSlotTimes],
    };
  }
  return {
    ...base,
    isWorkday: exception.isWorkday,
    scheduleMode: exception.scheduleMode,
    startTime: exception.startTime ?? base.startTime,
    endTime: exception.endTime ?? base.endTime,
    breaks: exception.breaks.map((item) => ({ ...item })),
    fixedSlotTimes: [...exception.fixedSlotTimes],
  };
}

function isConflictStatus(status: string): boolean {
  return status !== "REJECTED" && status !== "CANCELLED" && status !== "NO_SHOW" && status !== "FINISHED";
}

function canCancelForOffDay(status: string): boolean {
  return status === "PENDING" || status === "CONFIRMED" || status === "CHANGE_REQUESTED";
}

function formatTimeLabel(dateTimeIso: string | null, timeZone: string): string {
  if (!dateTimeIso) return "--:--";
  const date = new Date(dateTimeIso);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

function formatMoney(amount: number | null | undefined): string {
  if (!Number.isFinite(amount)) return "—";
  return `${new Intl.NumberFormat("ru-RU").format(amount as number)} ${UI_TEXT.common.currencyRub}`;
}

function bookingStatusLabel(status: string): string {
  const statusText = UI_TEXT.cabinet.master.schedule.bookingStatus;
  if (status === "PENDING" || status === "NEW") return statusText.pending;
  if (status === "CONFIRMED") return statusText.confirmed;
  if (status === "CHANGE_REQUESTED") return statusText.changeRequested;
  if (status === "IN_PROGRESS" || status === "STARTED") return statusText.inProgress;
  if (status === "FINISHED") return statusText.finished;
  if (status === "REJECTED" || status === "CANCELLED" || status === "NO_SHOW") return statusText.cancelled;
  return status;
}

export function MasterScheduleEditor({
  apiPath = "/api/cabinet/master/schedule",
  showDayConsole = false,
}: {
  apiPath?: string;
  showDayConsole?: boolean;
}) {
  const [timezone, setTimezone] = useState("Europe/Moscow");
  const [week, setWeek] = useState<DaySchedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [templates, setTemplates] = useState<WeekTemplate[]>([]);
  const [openDay, setOpenDay] = useState<number | null>(0);
  const [activeTemplate, setActiveTemplate] = useState("custom");
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [copySource, setCopySource] = useState<number | null>(null);
  const [copyTargets, setCopyTargets] = useState<number[]>([]);
  const [slotInputByDay, setSlotInputByDay] = useState<Record<number, string>>({});
  const [exceptionSlotInput, setExceptionSlotInput] = useState("10:00");
  const [draft, setDraft] = useState<DaySchedule | null>(null);
  const [dayPanelMode, setDayPanelMode] = useState<"view" | "edit">("view");
  const [dayData, setDayData] = useState<MasterDayData | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [offDayConflict, setOffDayConflict] = useState<DayOffConflictDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingWeek, setSavingWeek] = useState(false);
  const [savingException, setSavingException] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [approval, setApproval] = useState<ApprovalInfo>(defaultApproval());

  const exceptionByDate = useMemo(() => new Map(exceptions.map((item) => [item.date, item])), [exceptions]);
  const selectedKey = selectedDate ? toDateKey(selectedDate, timezone) : null;
  const selectedBase = selectedKey ? week[dayIndexFromDateKey(selectedKey)] ?? null : null;
  const selectedException = selectedKey ? exceptionByDate.get(selectedKey) ?? null : null;

  useEffect(() => {
    if (!selectedBase) {
      setDraft(null);
      return;
    }
    setDraft(buildDraftFromSelection(selectedBase, selectedException));
  }, [selectedBase, selectedException]);

  useEffect(() => {
    setDayPanelMode("view");
    setOffDayConflict(null);
  }, [selectedKey]);

  const calendarDays = useMemo(() => {
    const start = startOfWeekMonday(startOfMonth(month));
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [month]);

  const futureExceptions = useMemo(() => {
    const today = toDateKey(new Date(), timezone);
    return exceptions.filter((item) => item.date >= today).sort((left, right) => left.date.localeCompare(right.date));
  }, [exceptions, timezone]);

  const applyPayload = useCallback((payload: SchedulePayload) => {
    setTimezone(payload.timezone);
    setWeek(payload.weekSchedule);
    setTemplates(payload.templates);
    setExceptions(payload.exceptions.slice().sort((left, right) => left.date.localeCompare(right.date)));
    setApproval(payload.approval ?? defaultApproval());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuth(apiPath, { cache: "no-store" });
      const json = (await response.json().catch(() => null)) as ApiResponse<SchedulePayload> | null;
      if (!response.ok || !json || !json.ok) throw new Error(json && !json.ok ? json.error.message : T.errors.load);
      applyPayload(json.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : T.errors.load);
    } finally {
      setLoading(false);
    }
  }, [apiPath, applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!showDayConsole || !selectedKey) {
      setDayData(null);
      setDayError(null);
      setDayLoading(false);
      return;
    }

    const controller = new AbortController();
    const loadDayData = async (): Promise<void> => {
      setDayLoading(true);
      setDayError(null);
      try {
        const response = await fetchWithAuth(`/api/master/day?date=${encodeURIComponent(selectedKey)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = (await response.json().catch(() => null)) as ApiResponse<MasterDayData> | null;
        if (!response.ok || !json || !json.ok) {
          throw new Error(json && !json.ok ? json.error.message : T.errors.loadDayBookings);
        }
        setDayData(json.data);
      } catch (dayLoadError) {
        if (dayLoadError instanceof DOMException && dayLoadError.name === "AbortError") return;
        setDayError(dayLoadError instanceof Error ? dayLoadError.message : T.errors.loadDayBookings);
        setDayData(null);
      } finally {
        if (!controller.signal.aborted) {
          setDayLoading(false);
        }
      }
    };

    void loadDayData();
    return () => controller.abort();
  }, [selectedKey, showDayConsole]);

  const patch = useCallback(async (body: unknown) => {
    const response = await fetchWithAuth(apiPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as ApiResponse<SchedulePayload> | null;
    if (!response.ok || !json || !json.ok) {
      const patchError = new Error(json && !json.ok ? json.error.message : T.errors.saveWeek) as PatchError;
      if (json && !json.ok) {
        patchError.code = json.error.code;
        patchError.details = json.error.details;
      }
      throw patchError;
    }
    applyPayload(json.data);
    const action = json.data.approval?.lastAction;
    if (action === "REQUEST_CREATED" || action === "REQUEST_UPDATED") {
      setInfo(T.info.requestSubmitted);
    } else if (action === "NO_CHANGES") {
      setInfo(T.info.noChanges);
    } else {
      setInfo(T.saved);
    }
    window.setTimeout(() => setInfo(null), 2500);
  }, [apiPath, applyPayload]);

  const updateDay = (dayIndex: number, patchDay: Partial<DaySchedule>) => {
    setWeek((current) => current.map((item) => (item.dayOfWeek === dayIndex ? { ...item, ...patchDay } : item)));
    setActiveTemplate("custom");
  };

  const saveWeekChanges = async () => {
    setSavingWeek(true);
    setError(null);
    try {
      await patch({ weekSchedule: week });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : T.errors.saveWeek);
    } finally {
      setSavingWeek(false);
    }
  };

  const saveExceptionPayload = async (
    payload: unknown,
    conflictResolution?: { action: "CANCEL_BOOKINGS_AND_SET_OFF"; bookingIds: string[] }
  ) => {
    setSavingException(true);
    setError(null);
    setOffDayConflict(null);
    try {
      await patch(
        conflictResolution
          ? { exception: payload, dayOffConflictResolution: conflictResolution }
          : { exception: payload }
      );
      setDayPanelMode("view");
    } catch (saveError) {
      const patchError = saveError as PatchError;
      if (patchError?.code === "SCHEDULE_DAY_OFF_CONFLICT") {
        setOffDayConflict((patchError.details as DayOffConflictDetails) ?? null);
      }
      setError(saveError instanceof Error ? saveError.message : T.errors.saveException);
    } finally {
      setSavingException(false);
    }
  };

  const deleteExceptionById = async (id: string) => {
    setSavingException(true);
    setError(null);
    try {
      await patch({ deleteException: id });
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : T.errors.deleteException);
    } finally {
      setSavingException(false);
    }
  };

  const isStudioMaster = approval.mode === "STUDIO_MASTER";
  const hasPendingRequest = approval.requestStatus === "PENDING";

  useEffect(() => {
    if (draft?.isWorkday !== false) {
      setOffDayConflict(null);
    }
  }, [draft?.isWorkday]);

  const dayBookings = useMemo(() => {
    if (!showDayConsole) return [];
    return [...(dayData?.bookings ?? [])].sort((left, right) => {
      const leftTime = left.startAtUtc ? new Date(left.startAtUtc).getTime() : 0;
      const rightTime = right.startAtUtc ? new Date(right.startAtUtc).getTime() : 0;
      return leftTime - rightTime;
    });
  }, [dayData?.bookings, showDayConsole]);

  const conflictingDayBookings = useMemo(
    () => dayBookings.filter((item) => isConflictStatus(item.status)),
    [dayBookings]
  );

  const canConfirmOffDayCancellation = useMemo(
    () => conflictingDayBookings.length > 0 && conflictingDayBookings.every((item) => canCancelForOffDay(item.status)),
    [conflictingDayBookings]
  );

  const resolvedDayStatus = useMemo(() => {
    const source = draft ?? selectedBase;
    if (!source || !source.isWorkday) return T.baseStatusHoliday;
    if (source.scheduleMode === "FIXED") return T.baseStatusWorkFixed;
    return T.baseStatusWorkflexible(source.startTime, source.endTime);
  }, [draft, selectedBase]);

  const offDayWarningBookings = useMemo(() => {
    if (offDayConflict?.bookings?.length) return offDayConflict.bookings;
    return conflictingDayBookings.map((item) => ({
      id: item.id,
      clientName: item.clientName,
      status: item.status,
      timeLabel: formatTimeLabel(item.startAtUtc, timezone),
      canCancel: canCancelForOffDay(item.status),
    }));
  }, [conflictingDayBookings, offDayConflict?.bookings, timezone]);

  if (loading) return <div className="rounded-2xl border border-border-subtle bg-bg-card p-6 text-sm text-text-sec">{T.loading}</div>;

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      {isStudioMaster ? (
        <div className="rounded-2xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p>
            {hasPendingRequest
              ? T.studioMaster.pendingRequest
              : T.studioMaster.submitForApproval}
          </p>
          {approval.rejectedComment ? (
            <p className="mt-1 text-xs text-amber-200/90">
              {T.studioMaster.lastCommentPrefix} {approval.rejectedComment}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr_300px]">
        <Card>
          <CardHeader className="pb-3">
            <h3 className="text-base font-semibold text-text-main">{T.baseWeek}</h3>
            <label className="mt-3 block text-xs uppercase tracking-wide text-text-sec">{T.templateLabel}</label>
            <Select value={activeTemplate} onChange={(event) => {
              const next = event.target.value;
              setActiveTemplate(next);
              if (next === "standard") setWeek((current) => current.map((item, index) => ({ ...item, isWorkday: index < 5, scheduleMode: "FLEXIBLE", startTime: DEFAULT_START, endTime: DEFAULT_END, breaks: [], fixedSlotTimes: [] })));
              if (next === "2x2") setWeek((current) => current.map((item, index) => ({ ...item, isWorkday: index % 2 === 0, scheduleMode: "FLEXIBLE", startTime: DEFAULT_START, endTime: DEFAULT_END, breaks: [], fixedSlotTimes: [] })));
            }}>
              <option value="custom">{T.templateCustom}</option>
              {templates.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </Select>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-input/40">
              {week.map((day) => {
                const isOpen = openDay === day.dayOfWeek;
                return (
                  <div key={day.dayOfWeek} className="border-b border-border-subtle/70 last:border-b-0">
                    <Button variant="wrapper" className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setOpenDay(isOpen ? null : day.dayOfWeek)}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-main">{DAY_NAMES[day.dayOfWeek]}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${day.isWorkday ? day.scheduleMode === "FIXED" ? "bg-purple-500/15 text-purple-300" : "bg-blue-500/15 text-blue-300" : "bg-white/10 text-text-sec"}`}>{day.isWorkday ? day.scheduleMode === "FIXED" ? T.fixed : T.flexible : T.dayOff}</span>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-text-sec transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </Button>
                    {isOpen ? (
                      <div className="space-y-3 px-4 pb-4">
                        <div className="flex items-center justify-between"><span className="text-sm text-text-sec">{T.workday}</span><Switch checked={day.isWorkday} onCheckedChange={(value) => updateDay(day.dayOfWeek, { isWorkday: value })} size="sm" /></div>
                        {day.isWorkday ? (
                          <>
                            <div className="flex rounded-xl bg-white/6 p-1">
                              <Button variant={day.scheduleMode === "FLEXIBLE" ? "primary" : "secondary"} size="none" className={`flex-1 rounded-lg py-1.5 text-xs ${day.scheduleMode === "FLEXIBLE" ? "bg-white/15 text-text-main" : "text-text-sec"}`} onClick={() => updateDay(day.dayOfWeek, { scheduleMode: "FLEXIBLE" })}>{T.flexible}</Button>
                              <Button variant={day.scheduleMode === "FIXED" ? "primary" : "secondary"} size="none" className={`flex-1 rounded-lg py-1.5 text-xs ${day.scheduleMode === "FIXED" ? "bg-white/15 text-text-main" : "text-text-sec"}`} onClick={() => updateDay(day.dayOfWeek, { scheduleMode: "FIXED" })}>{T.fixed}</Button>
                            </div>
                            {day.scheduleMode === "FLEXIBLE" ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Input type="time" value={day.startTime} onChange={(event) => updateDay(day.dayOfWeek, { startTime: event.target.value })} className="h-9 rounded-xl px-3 text-sm" />
                                  <span className="text-text-sec">-</span>
                                  <Input type="time" value={day.endTime} onChange={(event) => updateDay(day.dayOfWeek, { endTime: event.target.value })} className="h-9 rounded-xl px-3 text-sm" />
                                </div>
                                {day.breaks.map((item, index) => (
                                  <div key={`${day.dayOfWeek}-break-${index}`} className="flex items-center gap-2">
                                    <Input
                                      type="time"
                                      value={item.start}
                                      onChange={(event) =>
                                        setWeek((current) =>
                                          current.map((entry) =>
                                            entry.dayOfWeek === day.dayOfWeek
                                              ? {
                                                  ...entry,
                                                  breaks: entry.breaks.map((breakEntry, breakIndex) =>
                                                    breakIndex === index ? { ...breakEntry, start: event.target.value } : breakEntry
                                                  ),
                                                }
                                              : entry
                                          )
                                        )
                                      }
                                      className="h-9 rounded-xl px-3 text-sm"
                                    />
                                    <span className="text-text-sec">-</span>
                                    <Input
                                      type="time"
                                      value={item.end}
                                      onChange={(event) =>
                                        setWeek((current) =>
                                          current.map((entry) =>
                                            entry.dayOfWeek === day.dayOfWeek
                                              ? {
                                                  ...entry,
                                                  breaks: entry.breaks.map((breakEntry, breakIndex) =>
                                                    breakIndex === index ? { ...breakEntry, end: event.target.value } : breakEntry
                                                  ),
                                                }
                                              : entry
                                          )
                                        )
                                      }
                                      className="h-9 rounded-xl px-3 text-sm"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="none"
                                      onClick={() =>
                                        setWeek((current) =>
                                          current.map((entry) =>
                                            entry.dayOfWeek === day.dayOfWeek
                                              ? { ...entry, breaks: entry.breaks.filter((_, breakIndex) => breakIndex !== index) }
                                              : entry
                                          )
                                        )
                                      }
                                      className="flex h-7 w-7 items-center justify-center rounded-full text-text-sec hover:bg-red-500/10 hover:text-red-300"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  variant="ghost"
                                  size="none"
                                  onClick={() =>
                                    setWeek((current) =>
                                      current.map((entry) =>
                                        entry.dayOfWeek === day.dayOfWeek
                                          ? { ...entry, breaks: [...entry.breaks, { start: "13:00", end: "14:00" }] }
                                          : entry
                                      )
                                    )
                                  }
                                  className="text-xs text-text-sec hover:text-text-main"
                                >
                                  {T.addBreak}
                                </Button>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-xs text-text-sec">{T.fixedHint}</p>
                                <div className="flex flex-wrap gap-2">
                                  {day.fixedSlotTimes.map((slot) => (
                                    <div key={`${day.dayOfWeek}-${slot}`} className="flex items-center gap-1 rounded-lg bg-purple-500/15 px-2 py-1">
                                      <span className="text-xs text-purple-200">{slot}</span>
                                      <Button variant="ghost" size="none" onClick={() => setWeek((current) => current.map((entry) => entry.dayOfWeek === day.dayOfWeek ? { ...entry, fixedSlotTimes: entry.fixedSlotTimes.filter((value) => value !== slot) } : entry))}>
                                        <X className="h-3 w-3 text-purple-200/70 hover:text-purple-100" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Input type="time" value={slotInputByDay[day.dayOfWeek] ?? ""} onChange={(event) => setSlotInputByDay((current) => ({ ...current, [day.dayOfWeek]: event.target.value }))} className="h-9 rounded-xl px-3 text-sm" />
                                  <Button
                                    variant="ghost"
                                    size="none"
                                    onClick={() => {
                                      const next = normalizeTime(slotInputByDay[day.dayOfWeek] ?? "");
                                      if (!next) return;
                                      setWeek((current) =>
                                        current.map((entry) =>
                                          entry.dayOfWeek === day.dayOfWeek
                                            ? { ...entry, fixedSlotTimes: normalizeSlots([...entry.fixedSlotTimes, next]) }
                                            : entry
                                        )
                                      );
                                      setSlotInputByDay((current) => ({ ...current, [day.dayOfWeek]: "" }));
                                    }}
                                    className="rounded-xl border border-border-subtle px-3 py-2 text-xs text-text-main"
                                  >
                                    {T.addSlot}
                                  </Button>
                                </div>
                              </div>
                            )}
                            <Button variant="ghost" size="none" className="w-full rounded-xl border border-border-subtle py-2 text-xs text-text-sec hover:bg-white/5" onClick={() => { setCopySource(day.dayOfWeek); setCopyTargets([]); }}>
                              {T.copyToDays}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between"><span className="text-sm text-text-sec">{info}</span><Button variant="secondary" size="sm" onClick={() => void saveWeekChanges()} disabled={savingWeek}>{savingWeek ? T.saving : T.save}</Button></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-main">{T.calendar}</h3>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="none" className="rounded-lg border border-border-subtle bg-bg-input p-1.5" onClick={() => setMonth((current) => addMonths(current, -1))}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="min-w-[140px] text-center text-sm font-medium">{capitalize(formatRu(month, { month: "long", year: "numeric" }))}</span>
                <Button variant="secondary" size="none" className="rounded-lg border border-border-subtle bg-bg-input p-1.5" onClick={() => setMonth((current) => addMonths(current, 1))}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2 text-center text-xs text-text-sec">{DAY_SHORT.map((label) => <div key={label}>{label}</div>)}</div>
            <div className="mt-2 grid grid-cols-7 gap-2 rounded-2xl bg-bg-input/35 p-2">
              {calendarDays.map((date) => {
                const key = toDateKey(date, timezone);
                const base = week[dayIndexFromDateKey(key)];
                const exception = exceptionByDate.get(key);
                const isWorkday = exception?.isWorkday ?? base?.isWorkday ?? false;
                const mode = exception?.scheduleMode ?? base?.scheduleMode ?? "FLEXIBLE";
                const isSelected = selectedDate ? isSameDay(selectedDate, date) : false;
                const hasException = Boolean(exception);
                return (
                  <Button key={key} variant="wrapper" onClick={() => setSelectedDate((current) => current && isSameDay(current, date) ? null : date)} className={`relative min-h-[64px] rounded-xl border border-border-subtle/70 p-2 text-left text-sm transition-colors hover:bg-white/4 ${isSameMonth(date, month) ? "bg-bg-card" : "bg-bg-input text-text-sec"} ${isSelected ? "ring-2 ring-primary/70" : ""} ${!isWorkday ? "opacity-40" : ""} ${hasException ? "ring-1 ring-amber-400/50" : ""}`}>
                    <span>{formatRu(date, { day: "numeric" })}</span>
                    {isWorkday ? <span className={`absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full ${hasException ? "bg-amber-400" : mode === "FIXED" ? "bg-purple-400" : "bg-blue-400"}`} /> : null}
                  </Button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-3 text-xs text-text-sec"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />{T.legendFlexible}</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-400" />{T.legendFixed}</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />{T.legendException}</span></div>
          </CardContent>
        </Card>

        <Card>
          {showDayConsole && selectedDate && selectedBase && draft && dayPanelMode === "view" ? (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-text-main">
                      {formatRu(selectedDate, { day: "numeric", month: "long", year: "numeric" })}
                    </h3>
                    <p className="text-xs text-text-sec">{capitalize(formatRu(selectedDate, { weekday: "long" }))}</p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    aria-label={T.editDayAria}
                    title={T.editDayAria}
                    onClick={() => setDayPanelMode("edit")}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-text-sec">{resolvedDayStatus}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {dayLoading ? (
                  <p className="text-sm text-text-sec">{T.loading}</p>
                ) : dayError ? (
                  <p className="text-sm text-red-300">{dayError}</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-input/50 px-3 py-2 text-sm text-text-main">
                      <span>{T.dayBookingsTitle}</span>
                      <span className="font-semibold">{dayBookings.length}</span>
                    </div>
                    {dayData?.isSolo ? (
                      <Button asChild size="sm" variant="secondary" className="w-full">
                        <Link href={`/cabinet/master/dashboard?manual=1&date=${encodeURIComponent(selectedKey ?? "")}`}>
                          {T.addBookingCta}
                        </Link>
                      </Button>
                    ) : null}
                    {dayBookings.length === 0 ? (
                      <div className="rounded-xl border border-border-subtle bg-bg-input/50 px-3 py-4 text-sm text-text-sec">
                        {T.dayFreeState}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {dayBookings.map((booking) => (
                          <Link
                            key={booking.id}
                            href={`/cabinet/master/dashboard?date=${encodeURIComponent(selectedKey ?? "")}&bookingId=${encodeURIComponent(booking.id)}&chat=open`}
                            className="block rounded-xl border border-border-subtle bg-bg-input/60 px-3 py-2 text-sm transition-colors hover:bg-bg-input"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-1">
                                <div className="font-medium text-text-main">
                                  {formatTimeLabel(booking.startAtUtc, timezone)} • {booking.serviceTitle}
                                </div>
                                <div className="text-xs text-text-sec">{booking.clientName}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-xs text-text-main">{formatMoney(booking.price)}</div>
                                <div className="text-[11px] text-text-sec">{bookingStatusLabel(booking.status)}</div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  {selectedDate ? (
                    <div>
                      <h3 className="text-base font-semibold text-text-main">
                        {formatRu(selectedDate, { day: "numeric", month: "long", year: "numeric" })}
                      </h3>
                      <p className="text-xs text-text-sec">{capitalize(formatRu(selectedDate, { weekday: "long" }))}</p>
                    </div>
                  ) : (
                    <h3 className="text-base font-semibold text-text-main">{T.futureExceptions}</h3>
                  )}
                  {showDayConsole && selectedBase && draft ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      aria-label={T.backToDayAria}
                      title={T.backToDayAria}
                      onClick={() => {
                        setOffDayConflict(null);
                        setDraft(buildDraftFromSelection(selectedBase, selectedException));
                        setDayPanelMode("view");
                      }}
                    >
                      <CalendarDays className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
            {!selectedDate ? (
              futureExceptions.length === 0 ? <p className="text-sm text-text-sec">{T.noExceptions}</p> : (
                <div className="space-y-2">
                  {futureExceptions.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl bg-bg-input/50 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-text-main">{formatRu(new Date(`${item.date}T00:00:00.000Z`), { day: "numeric", month: "long" })}</p>
                        <p className="text-xs text-text-sec">{!item.isWorkday ? T.dayOff : item.scheduleMode === "FIXED" ? `${T.fixed}: ${item.fixedSlotTimes.join(", ")}` : `${item.startTime ?? "--:--"}-${item.endTime ?? "--:--"}`}</p>
                      </div>
                      <Button variant="ghost" size="none" onClick={() => void deleteExceptionById(item.id)} className="flex h-7 w-7 items-center justify-center rounded-full text-text-sec hover:bg-red-500/10 hover:text-red-300"><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                </div>
              )
            ) : selectedBase && draft ? (
              <>
                <div className="rounded-xl bg-bg-input/60 px-3 py-2 text-xs text-text-sec">{T.baseWeek}: {selectedBase.isWorkday ? selectedBase.scheduleMode === "FIXED" ? T.baseStatusWorkFixed : T.baseStatusWorkflexible(selectedBase.startTime, selectedBase.endTime) : T.baseStatusHoliday}</div>
                {selectedException ? <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2"><AlertTriangle className="h-3.5 w-3.5 text-amber-400" /><span className="text-xs text-amber-200">{T.exceptionApplied}</span></div> : null}
                <div className="flex gap-2">
                  {draft.isWorkday ? (
                    <Button variant="secondary" size="sm" className="flex-1" onClick={() => void (selectedKey ? saveExceptionPayload({ date: selectedKey, isWorkday: false, scheduleMode: "FLEXIBLE" }) : Promise.resolve())} disabled={savingException}>
                      {T.makeHoliday}
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" className="flex-1" onClick={() => void (selectedKey ? saveExceptionPayload({ date: selectedKey, isWorkday: true, scheduleMode: selectedBase.scheduleMode, startTime: selectedBase.startTime, endTime: selectedBase.endTime, breaks: selectedBase.breaks, fixedSlotTimes: selectedBase.fixedSlotTimes }) : Promise.resolve())} disabled={savingException}>
                      {T.makeWorkday}
                    </Button>
                  )}
                </div>

                {draft.isWorkday ? (
                  <div className="space-y-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-text-sec">{T.changeThisDay}</p>
                    <div className="flex rounded-xl bg-white/6 p-1">
                      <Button variant={draft.scheduleMode === "FLEXIBLE" ? "primary" : "secondary"} size="none" className={`flex-1 rounded-lg py-1.5 text-xs ${draft.scheduleMode === "FLEXIBLE" ? "bg-white/15 text-text-main" : "text-text-sec"}`} onClick={() => setDraft((current) => current ? { ...current, scheduleMode: "FLEXIBLE" } : current)}>{T.flexible}</Button>
                      <Button variant={draft.scheduleMode === "FIXED" ? "primary" : "secondary"} size="none" className={`flex-1 rounded-lg py-1.5 text-xs ${draft.scheduleMode === "FIXED" ? "bg-white/15 text-text-main" : "text-text-sec"}`} onClick={() => setDraft((current) => current ? { ...current, scheduleMode: "FIXED" } : current)}>{T.fixed}</Button>
                    </div>

                    {draft.scheduleMode === "FLEXIBLE" ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Input type="time" value={draft.startTime} onChange={(event) => setDraft((current) => current ? { ...current, startTime: event.target.value } : current)} className="h-9 rounded-xl px-3 text-sm" />
                          <span className="text-text-sec">-</span>
                          <Input type="time" value={draft.endTime} onChange={(event) => setDraft((current) => current ? { ...current, endTime: event.target.value } : current)} className="h-9 rounded-xl px-3 text-sm" />
                        </div>
                        {draft.breaks.map((item, index) => (
                          <div key={`exception-break-${index}`} className="flex items-center gap-2">
                            <Input type="time" value={item.start} onChange={(event) => setDraft((current) => current ? { ...current, breaks: current.breaks.map((entry, breakIndex) => breakIndex === index ? { ...entry, start: event.target.value } : entry) } : current)} className="h-9 rounded-xl px-3 text-sm" />
                            <span className="text-text-sec">-</span>
                            <Input type="time" value={item.end} onChange={(event) => setDraft((current) => current ? { ...current, breaks: current.breaks.map((entry, breakIndex) => breakIndex === index ? { ...entry, end: event.target.value } : entry) } : current)} className="h-9 rounded-xl px-3 text-sm" />
                            <Button variant="ghost" size="none" onClick={() => setDraft((current) => current ? { ...current, breaks: current.breaks.filter((_, breakIndex) => breakIndex !== index) } : current)} className="flex h-7 w-7 items-center justify-center rounded-full text-text-sec hover:bg-red-500/10 hover:text-red-300">
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        <Button variant="ghost" size="none" onClick={() => setDraft((current) => current ? { ...current, breaks: [...current.breaks, { start: "13:00", end: "14:00" }] } : current)} className="text-xs text-text-sec hover:text-text-main">
                          {T.addBreak}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {draft.fixedSlotTimes.map((slot) => (
                          <div key={`exception-slot-${slot}`} className="flex items-center justify-between rounded-xl bg-bg-input/50 px-3 py-2">
                            <span className="text-sm">{slot}</span>
                            <Button variant="ghost" size="none" onClick={() => setDraft((current) => current ? { ...current, fixedSlotTimes: current.fixedSlotTimes.filter((value) => value !== slot) } : current)}>
                              <X className="h-3.5 w-3.5 text-text-sec hover:text-red-300" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <Input type="time" value={exceptionSlotInput} onChange={(event) => setExceptionSlotInput(event.target.value)} className="h-9 rounded-xl px-3 text-sm" />
                          <Button variant="ghost" size="none" onClick={() => {
                            const next = normalizeTime(exceptionSlotInput);
                            if (!next) return;
                            setDraft((current) => current ? { ...current, fixedSlotTimes: normalizeSlots([...current.fixedSlotTimes, next]) } : current);
                            setExceptionSlotInput("");
                          }} className="rounded-xl border border-border-subtle px-3 py-2 text-xs text-text-main">
                            {T.addSlot}
                          </Button>
                        </div>
                      </div>
                    )}

                    {showDayConsole && approval.mode === "SOLO_MASTER" && !draft.isWorkday && offDayWarningBookings.length > 0 ? (
                      <div className="space-y-2 rounded-xl border border-amber-400/35 bg-amber-500/10 p-3">
                        <div className="text-sm font-medium text-amber-100">
                          {T.offDayConflictTitle(offDayWarningBookings.length)}
                        </div>
                        <div className="space-y-1 text-xs text-amber-100/90">
                          {offDayWarningBookings.map((item) => (
                            <div key={item.id}>
                              {item.clientName} ({item.timeLabel})
                              {item.canCancel ? "" : ` ${T.offDayConflictCannotAutoCancel}`}
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            disabled={savingException || !canConfirmOffDayCancellation}
                            onClick={() =>
                              void (
                                selectedKey
                                  ? saveExceptionPayload(
                                      {
                                        date: selectedKey,
                                        isWorkday: draft.isWorkday,
                                        scheduleMode: draft.scheduleMode,
                                        startTime: draft.scheduleMode === "FIXED" ? FIXED_START : draft.startTime,
                                        endTime: draft.scheduleMode === "FIXED" ? FIXED_END : draft.endTime,
                                        breaks: draft.scheduleMode === "FLEXIBLE" ? draft.breaks : [],
                                        fixedSlotTimes: draft.scheduleMode === "FIXED" ? draft.fixedSlotTimes : [],
                                      },
                                      {
                                        action: "CANCEL_BOOKINGS_AND_SET_OFF",
                                        bookingIds: offDayWarningBookings.map((item) => item.id),
                                      }
                                    )
                                  : Promise.resolve()
                              )
                            }
                          >
                            {T.offDayConflictConfirm}
                          </Button>
                          <Button
                            variant="secondary"
                            className="flex-1"
                            onClick={() => {
                              setOffDayConflict(null);
                              if (selectedBase) {
                                setDraft(buildDraftFromSelection(selectedBase, selectedException));
                              }
                              setDayPanelMode("view");
                            }}
                          >
                            {T.offDayConflictKeep}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button className="w-full" onClick={() => void (selectedKey ? saveExceptionPayload({ date: selectedKey, isWorkday: draft.isWorkday, scheduleMode: draft.scheduleMode, startTime: draft.scheduleMode === "FIXED" ? FIXED_START : draft.startTime, endTime: draft.scheduleMode === "FIXED" ? FIXED_END : draft.endTime, breaks: draft.scheduleMode === "FLEXIBLE" ? draft.breaks : [], fixedSlotTimes: draft.scheduleMode === "FIXED" ? draft.fixedSlotTimes : [] }) : Promise.resolve())} disabled={savingException}>
                        {T.applyException}
                      </Button>
                    )}
                  </div>
                ) : null}

                {selectedException ? (
                  <Button variant="secondary" size="sm" className="w-full text-text-sec hover:text-red-300" onClick={() => void deleteExceptionById(selectedException.id)} disabled={savingException}>
                    {T.resetToBase}
                  </Button>
                ) : null}
              </>
            ) : <p className="text-sm text-text-sec">{T.noExceptions}</p>}
          </CardContent>
            </>
          )}
        </Card>
      </div>

      <ModalSurface open={copySource !== null} onClose={() => { setCopySource(null); setCopyTargets([]); }} title={T.copyModalTitle} className="max-w-md">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">{copySource !== null ? DAY_SHORT.map((name, index) => index === copySource ? null : <Button key={index} variant={copyTargets.includes(index) ? "primary" : "secondary"} size="none" onClick={() => setCopyTargets((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} className={`rounded-xl px-4 py-2 text-sm ${copyTargets.includes(index) ? "bg-primary text-white" : "bg-bg-input text-text-main"}`}>{name}</Button>) : null}</div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setCopySource(null); setCopyTargets([]); }}>{T.cancel}</Button>
            <Button className="flex-1" onClick={() => {
              if (copySource === null || copyTargets.length === 0) return;
              const source = week.find((item) => item.dayOfWeek === copySource);
              if (!source) return;
              setWeek((current) => current.map((item) => copyTargets.includes(item.dayOfWeek) ? { ...item, isWorkday: source.isWorkday, scheduleMode: source.scheduleMode, startTime: source.startTime, endTime: source.endTime, breaks: source.breaks.map((entry) => ({ ...entry })), fixedSlotTimes: [...source.fixedSlotTimes] } : item));
              setCopySource(null);
              setCopyTargets([]);
            }}>{T.add}</Button>
          </div>
        </div>
      </ModalSurface>
    </section>
  );
}
