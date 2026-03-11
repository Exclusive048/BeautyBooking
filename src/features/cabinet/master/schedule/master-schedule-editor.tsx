"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
type SchedulePayload = {
  timezone: string;
  weekSchedule: DaySchedule[];
  exceptions: ScheduleException[];
  templates: WeekTemplate[];
};

const T = UI_TEXT.cabinet.master.schedule;
const DAY_NAMES = T.dayNames;
const DAY_SHORT = T.dayShortNames;
const DEFAULT_START = "09:00";
const DEFAULT_END = "20:00";
const FIXED_START = "00:00";
const FIXED_END = "23:55";

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

const fetchWithAuth = (input: RequestInfo | URL, init?: RequestInit) =>
  fetch(input, { ...init, credentials: "include" });

export function MasterScheduleEditor() {
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
  const [loading, setLoading] = useState(true);
  const [savingWeek, setSavingWeek] = useState(false);
  const [savingException, setSavingException] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const exceptionByDate = useMemo(() => new Map(exceptions.map((item) => [item.date, item])), [exceptions]);
  const selectedKey = selectedDate ? toDateKey(selectedDate, timezone) : null;
  const selectedBase = selectedKey ? week[dayIndexFromDateKey(selectedKey)] ?? null : null;
  const selectedException = selectedKey ? exceptionByDate.get(selectedKey) ?? null : null;

  useEffect(() => {
    if (!selectedBase) {
      setDraft(null);
      return;
    }
    if (!selectedException) {
      setDraft({ ...selectedBase, breaks: selectedBase.breaks.map((item) => ({ ...item })), fixedSlotTimes: [...selectedBase.fixedSlotTimes] });
      return;
    }
    setDraft({
      ...selectedBase,
      isWorkday: selectedException.isWorkday,
      scheduleMode: selectedException.scheduleMode,
      startTime: selectedException.startTime ?? selectedBase.startTime,
      endTime: selectedException.endTime ?? selectedBase.endTime,
      breaks: selectedException.breaks.map((item) => ({ ...item })),
      fixedSlotTimes: [...selectedException.fixedSlotTimes],
    });
  }, [selectedBase, selectedException]);

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
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithAuth("/api/cabinet/master/schedule", { cache: "no-store" });
      const json = (await response.json().catch(() => null)) as ApiResponse<SchedulePayload> | null;
      if (!response.ok || !json || !json.ok) throw new Error(json && !json.ok ? json.error.message : T.errors.load);
      applyPayload(json.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : T.errors.load);
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = useCallback(async (body: unknown) => {
    const response = await fetchWithAuth("/api/cabinet/master/schedule", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as ApiResponse<SchedulePayload> | null;
    if (!response.ok || !json || !json.ok) throw new Error(json && !json.ok ? json.error.message : T.errors.saveWeek);
    applyPayload(json.data);
    setInfo(T.saved);
    window.setTimeout(() => setInfo(null), 2500);
  }, [applyPayload]);

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

  const saveExceptionPayload = async (payload: unknown) => {
    setSavingException(true);
    setError(null);
    try {
      await patch({ exception: payload });
    } catch (saveError) {
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

  if (loading) return <div className="rounded-2xl border border-border-subtle bg-bg-card p-6 text-sm text-text-sec">{T.loading}</div>;

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
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
                    <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setOpenDay(isOpen ? null : day.dayOfWeek)}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-main">{DAY_NAMES[day.dayOfWeek]}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${day.isWorkday ? day.scheduleMode === "FIXED" ? "bg-purple-500/15 text-purple-300" : "bg-blue-500/15 text-blue-300" : "bg-white/10 text-text-sec"}`}>{day.isWorkday ? day.scheduleMode === "FIXED" ? T.fixed : T.flexible : T.dayOff}</span>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-text-sec transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen ? (
                      <div className="space-y-3 px-4 pb-4">
                        <div className="flex items-center justify-between"><span className="text-sm text-text-sec">{T.workday}</span><Switch checked={day.isWorkday} onCheckedChange={(value) => updateDay(day.dayOfWeek, { isWorkday: value })} size="sm" /></div>
                        {day.isWorkday ? (
                          <>
                            <div className="flex rounded-xl bg-white/6 p-1">
                              <button type="button" className={`flex-1 rounded-lg py-1.5 text-xs ${day.scheduleMode === "FLEXIBLE" ? "bg-white/15 text-text-main" : "text-text-sec"}`} onClick={() => updateDay(day.dayOfWeek, { scheduleMode: "FLEXIBLE" })}>{T.flexible}</button>
                              <button type="button" className={`flex-1 rounded-lg py-1.5 text-xs ${day.scheduleMode === "FIXED" ? "bg-white/15 text-text-main" : "text-text-sec"}`} onClick={() => updateDay(day.dayOfWeek, { scheduleMode: "FIXED" })}>{T.fixed}</button>
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
                                    <button
                                      type="button"
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
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
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
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-xs text-text-sec">{T.fixedHint}</p>
                                <div className="flex flex-wrap gap-2">
                                  {day.fixedSlotTimes.map((slot) => (
                                    <div key={`${day.dayOfWeek}-${slot}`} className="flex items-center gap-1 rounded-lg bg-purple-500/15 px-2 py-1">
                                      <span className="text-xs text-purple-200">{slot}</span>
                                      <button type="button" onClick={() => setWeek((current) => current.map((entry) => entry.dayOfWeek === day.dayOfWeek ? { ...entry, fixedSlotTimes: entry.fixedSlotTimes.filter((value) => value !== slot) } : entry))}>
                                        <X className="h-3 w-3 text-purple-200/70 hover:text-purple-100" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Input type="time" value={slotInputByDay[day.dayOfWeek] ?? ""} onChange={(event) => setSlotInputByDay((current) => ({ ...current, [day.dayOfWeek]: event.target.value }))} className="h-9 rounded-xl px-3 text-sm" />
                                  <button
                                    type="button"
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
                                  </button>
                                </div>
                              </div>
                            )}
                            <button type="button" className="w-full rounded-xl border border-border-subtle py-2 text-xs text-text-sec hover:bg-white/5" onClick={() => { setCopySource(day.dayOfWeek); setCopyTargets([]); }}>
                              {T.copyToDays}
                            </button>
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
                <button type="button" className="rounded-lg border border-border-subtle bg-bg-input p-1.5" onClick={() => setMonth((current) => addMonths(current, -1))}><ChevronLeft className="h-4 w-4" /></button>
                <span className="min-w-[140px] text-center text-sm font-medium">{capitalize(formatRu(month, { month: "long", year: "numeric" }))}</span>
                <button type="button" className="rounded-lg border border-border-subtle bg-bg-input p-1.5" onClick={() => setMonth((current) => addMonths(current, 1))}><ChevronRight className="h-4 w-4" /></button>
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
                  <button key={key} type="button" onClick={() => setSelectedDate((current) => current && isSameDay(current, date) ? null : date)} className={`relative min-h-[64px] rounded-xl border border-border-subtle/70 p-2 text-left text-sm transition-colors hover:bg-white/4 ${isSameMonth(date, month) ? "bg-bg-card" : "bg-bg-input text-text-sec"} ${isSelected ? "ring-2 ring-primary/70" : ""} ${!isWorkday ? "opacity-40" : ""} ${hasException ? "ring-1 ring-amber-400/50" : ""}`}>
                    <span>{formatRu(date, { day: "numeric" })}</span>
                    {isWorkday ? <span className={`absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full ${hasException ? "bg-amber-400" : mode === "FIXED" ? "bg-purple-400" : "bg-blue-400"}`} /> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-3 text-xs text-text-sec"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />{T.legendFlexible}</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-400" />{T.legendFixed}</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />{T.legendException}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            {selectedDate ? (
              <>
                <h3 className="text-base font-semibold text-text-main">{formatRu(selectedDate, { day: "numeric", month: "long", year: "numeric" })}</h3>
                <p className="text-xs text-text-sec">{capitalize(formatRu(selectedDate, { weekday: "long" }))}</p>
              </>
            ) : (
              <h3 className="text-base font-semibold text-text-main">{T.futureExceptions}</h3>
            )}
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
                      <button type="button" onClick={() => void deleteExceptionById(item.id)} className="flex h-7 w-7 items-center justify-center rounded-full text-text-sec hover:bg-red-500/10 hover:text-red-300"><X className="h-3.5 w-3.5" /></button>
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
                      <button type="button" className={`flex-1 rounded-lg py-1.5 text-xs ${draft.scheduleMode === "FLEXIBLE" ? "bg-white/15 text-text-main" : "text-text-sec"}`} onClick={() => setDraft((current) => current ? { ...current, scheduleMode: "FLEXIBLE" } : current)}>{T.flexible}</button>
                      <button type="button" className={`flex-1 rounded-lg py-1.5 text-xs ${draft.scheduleMode === "FIXED" ? "bg-white/15 text-text-main" : "text-text-sec"}`} onClick={() => setDraft((current) => current ? { ...current, scheduleMode: "FIXED" } : current)}>{T.fixed}</button>
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
                            <button type="button" onClick={() => setDraft((current) => current ? { ...current, breaks: current.breaks.filter((_, breakIndex) => breakIndex !== index) } : current)} className="flex h-7 w-7 items-center justify-center rounded-full text-text-sec hover:bg-red-500/10 hover:text-red-300">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <button type="button" onClick={() => setDraft((current) => current ? { ...current, breaks: [...current.breaks, { start: "13:00", end: "14:00" }] } : current)} className="text-xs text-text-sec hover:text-text-main">
                          {T.addBreak}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {draft.fixedSlotTimes.map((slot) => (
                          <div key={`exception-slot-${slot}`} className="flex items-center justify-between rounded-xl bg-bg-input/50 px-3 py-2">
                            <span className="text-sm">{slot}</span>
                            <button type="button" onClick={() => setDraft((current) => current ? { ...current, fixedSlotTimes: current.fixedSlotTimes.filter((value) => value !== slot) } : current)}>
                              <X className="h-3.5 w-3.5 text-text-sec hover:text-red-300" />
                            </button>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <Input type="time" value={exceptionSlotInput} onChange={(event) => setExceptionSlotInput(event.target.value)} className="h-9 rounded-xl px-3 text-sm" />
                          <button type="button" onClick={() => {
                            const next = normalizeTime(exceptionSlotInput);
                            if (!next) return;
                            setDraft((current) => current ? { ...current, fixedSlotTimes: normalizeSlots([...current.fixedSlotTimes, next]) } : current);
                            setExceptionSlotInput("");
                          }} className="rounded-xl border border-border-subtle px-3 py-2 text-xs text-text-main">
                            {T.addSlot}
                          </button>
                        </div>
                      </div>
                    )}

                    <Button className="w-full" onClick={() => void (selectedKey ? saveExceptionPayload({ date: selectedKey, isWorkday: draft.isWorkday, scheduleMode: draft.scheduleMode, startTime: draft.scheduleMode === "FIXED" ? FIXED_START : draft.startTime, endTime: draft.scheduleMode === "FIXED" ? FIXED_END : draft.endTime, breaks: draft.scheduleMode === "FLEXIBLE" ? draft.breaks : [], fixedSlotTimes: draft.scheduleMode === "FIXED" ? draft.fixedSlotTimes : [] }) : Promise.resolve())} disabled={savingException}>
                      {T.applyException}
                    </Button>
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
        </Card>
      </div>

      <ModalSurface open={copySource !== null} onClose={() => { setCopySource(null); setCopyTargets([]); }} title={T.copyModalTitle} className="max-w-md">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">{copySource !== null ? DAY_SHORT.map((name, index) => index === copySource ? null : <button key={index} type="button" onClick={() => setCopyTargets((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])} className={`rounded-xl px-4 py-2 text-sm ${copyTargets.includes(index) ? "bg-primary text-white" : "bg-bg-input text-text-main"}`}>{name}</button>) : null}</div>
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

