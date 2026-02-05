"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

type ScheduleDayLoad = {
  date: string;
  count: number;
};

type ScheduleException = {
  id: string;
  date: string;
  type: "OFF" | "SHIFT";
  startTime: string | null;
  endTime: string | null;
};

type ScheduleBlock = {
  id: string;
  startAt: string;
  endAt: string;
  type: "BREAK" | "BLOCK";
  note: string | null;
};

type ScheduleRequest = {
  id: string;
  type: "OFF" | "SHIFT" | "BLOCK";
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
};

type ScheduleData = {
  masterId: string;
  month: string;
  isSolo: boolean;
  dayLoads: ScheduleDayLoad[];
  exceptions: ScheduleException[];
  blocks: ScheduleBlock[];
  requests: ScheduleRequest[];
};

type WeeklyItem = {
  dayOfWeek: number;
  startLocal: string;
  endLocal: string;
};

type ApiErrorPayload = {
  ok: false;
  error: { message: string; code?: string };
};

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthShift(month: string, delta: number): string {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}

function dayLoadClass(count: number): string {
  if (count >= 6) return "bg-primary/24";
  if (count >= 3) return "bg-primary/16";
  if (count >= 1) return "bg-primary/10";
  return "bg-bg-card";
}

function toIsoWithTime(dateKey: string, time: string): string {
  return new Date(`${dateKey}T${time}:00.000Z`).toISOString();
}

function isValidTime(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

function toFriendlyError(message: string): string {
  if (message === "Invalid time range") return "Начало должно быть раньше конца.";
  if (message === "Validation error") return "Некорректный формат времени.";
  if (message === "Invalid buffer") return "Буфер должен быть кратен 5 минутам.";
  if (message === "Buffer out of range") return "Буфер должен быть в диапазоне от 0 до 30 минут.";
  return message;
}

type BreakDraft = {
  id: string;
  startTime: string;
  endTime: string;
  note: string;
};

function makeDraftId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

type TemplateMode = "2_2" | "3_3" | "5_2" | "EVERY_DAY";

const TEMPLATE_MODE_LABEL: Record<TemplateMode, string> = {
  "2_2": "2/2",
  "3_3": "3/3",
  "5_2": "5/2",
  EVERY_DAY: "Каждый день",
};

function positiveModulo(value: number, mod: number): number {
  return ((value % mod) + mod) % mod;
}

function buildMonthDays(monthKey: string): string[] {
  const first = new Date(`${monthKey}-01T00:00:00.000Z`);
  const next = new Date(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const days: string[] = [];
  for (let cursor = new Date(first); cursor < next; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.push(cursor.toISOString().slice(0, 10));
  }
  return days;
}

function isTemplateWorkingDay(input: {
  dateKey: string;
  cycleStartDate: string;
  mode: TemplateMode;
}): boolean {
  if (input.mode === "EVERY_DAY") return true;

  const dateMs = new Date(`${input.dateKey}T00:00:00.000Z`).getTime();
  const cycleStartMs = new Date(`${input.cycleStartDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(dateMs) || !Number.isFinite(cycleStartMs)) return true;

  const diffDays = Math.floor((dateMs - cycleStartMs) / (24 * 60 * 60 * 1000));
  if (input.mode === "2_2") {
    return positiveModulo(diffDays, 4) < 2;
  }
  if (input.mode === "3_3") {
    return positiveModulo(diffDays, 6) < 3;
  }
  return positiveModulo(diffDays, 7) < 5;
}

function formatDateTitle(dateKey: string): string {
  const value = new Date(`${dateKey}T00:00:00.000Z`);
  return value.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function MasterSchedulePage() {
  const [month, setMonth] = useState(currentMonthKey());
  const [data, setData] = useState<ScheduleData>({
    masterId: "",
    month: currentMonthKey(),
    isSolo: true,
    dayLoads: [],
    exceptions: [],
    blocks: [],
    requests: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(`${currentMonthKey()}-01`);
  const [shiftStart, setShiftStart] = useState("10:00");
  const [shiftEnd, setShiftEnd] = useState("19:00");
  const [busy, setBusy] = useState(false);

  const [defaultStart, setDefaultStart] = useState("10:00");
  const [defaultEnd, setDefaultEnd] = useState("19:00");
  const [defaultBuffer, setDefaultBuffer] = useState(10);
  const [bufferError, setBufferError] = useState<string | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(true);
  const [generatorTab, setGeneratorTab] = useState<"TEMPLATE" | "MANUAL">("TEMPLATE");
  const [templateMode, setTemplateMode] = useState<TemplateMode>("2_2");
  const [cycleStartDate, setCycleStartDate] = useState(`${currentMonthKey()}-01`);
  const [templateStart, setTemplateStart] = useState("10:00");
  const [templateEnd, setTemplateEnd] = useState("19:00");
  const [generatorBusy, setGeneratorBusy] = useState(false);

  const [breakDrafts, setBreakDrafts] = useState<BreakDraft[]>([
    { id: makeDraftId(), startTime: "13:00", endTime: "14:00", note: "" },
  ]);

  const dayLoadMap = useMemo(() => {
    const map = new Map<string, number>();
    data.dayLoads.forEach((item) => map.set(item.date, item.count));
    return map;
  }, [data.dayLoads]);

  const monthDays = useMemo(() => buildMonthDays(month), [month]);

  const previewByDay = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const day of monthDays) {
      map.set(day, isTemplateWorkingDay({ dateKey: day, cycleStartDate, mode: templateMode }));
    }
    return map;
  }, [cycleStartDate, monthDays, templateMode]);

  const selectedDayBreaks = useMemo(() => {
    return data.blocks
      .filter((item) => item.type === "BREAK" && item.startAt.slice(0, 10) === selectedDate)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [data.blocks, selectedDate]);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ month });
      const res = await fetch(`/api/master/schedule?${query.toString()}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<ScheduleData> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setData(json.data);

      const [weeklyRes, bufferRes] = await Promise.all([
        fetch("/api/master/schedule/weekly", { cache: "no-store" }),
        fetch("/api/master/schedule/buffer", { cache: "no-store" }),
      ]);

      const weeklyJson = (await weeklyRes.json().catch(() => null)) as
        | { ok: true; data: { items: WeeklyItem[] } }
        | { ok: false; error: { message: string } }
        | null;
      if (weeklyRes.ok && weeklyJson && weeklyJson.ok && weeklyJson.data.items.length > 0) {
        const first = weeklyJson.data.items[0];
        setDefaultStart(first.startLocal);
        setDefaultEnd(first.endLocal);
        setTemplateStart(first.startLocal);
        setTemplateEnd(first.endLocal);
      }

      const bufferJson = (await bufferRes.json().catch(() => null)) as
        | { ok: true; data: { bufferBetweenBookingsMin: number } }
        | { ok: false; error: { message: string } }
        | null;
      if (bufferRes.ok && bufferJson && bufferJson.ok) {
        setDefaultBuffer(bufferJson.data.bufferBetweenBookingsMin);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить график");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    if (selectedDate.startsWith(`${month}-`)) return;
    setSelectedDate(`${month}-01`);
  }, [month, selectedDate]);

  const applyDefaultWorkingTime = async (input: {
    start: string;
    end: string;
    buffer: number;
    successMessage?: string | null;
  }): Promise<boolean> => {
    if (!data.masterId) return false;
    if (!isValidTime(input.start) || !isValidTime(input.end)) {
      setError("Некорректный формат времени.");
      return false;
    }
    if (input.start >= input.end) {
      setError("Начало должно быть раньше конца.");
      return false;
    }
    if (!Number.isFinite(input.buffer) || input.buffer < 0) {
      setBufferError("Укажите корректный буфер от 0 минут.");
      return false;
    }

    const normalizedBuffer = Math.floor(input.buffer / 5) * 5;
    setDefaultBuffer(normalizedBuffer);
    setBufferError(null);

    setSavingDefaults(true);
    setError(null);
    setActionInfo(null);
    try {
      const weeklyBody = Array.from({ length: 7 }).map((_, day) => ({
        dayOfWeek: day,
        startLocal: input.start,
        endLocal: input.end,
        breaks: [],
      }));

      const weeklyRes = await fetch("/api/master/schedule/weekly", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(weeklyBody),
      });
      const weeklyJson = (await weeklyRes.json().catch(() => null)) as
        | { ok: true }
        | ApiErrorPayload
        | null;
      if (!weeklyRes.ok || !weeklyJson || !weeklyJson.ok) {
        const message =
          weeklyJson && !weeklyJson.ok
            ? toFriendlyError(weeklyJson.error.message)
            : `API error: ${weeklyRes.status}`;
        throw new Error(message);
      }

      const bufferRes = await fetch("/api/master/schedule/buffer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bufferBetweenBookingsMin: normalizedBuffer }),
      });
      const bufferJson = (await bufferRes.json().catch(() => null)) as
        | { ok: true }
        | ApiErrorPayload
        | null;
      if (!bufferRes.ok || !bufferJson || !bufferJson.ok) {
        const message =
          bufferJson && !bufferJson.ok
            ? toFriendlyError(bufferJson.error.message)
            : `API error: ${bufferRes.status}`;
        throw new Error(message);
      }

      await load();
      if (input.successMessage) {
        setActionInfo(input.successMessage);
      }
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось сохранить рабочее время по умолчанию"
      );
      return false;
    } finally {
      setSavingDefaults(false);
    }
  };

  const saveDefaultWorkingTime = async (): Promise<void> => {
    await applyDefaultWorkingTime({
      start: defaultStart,
      end: defaultEnd,
      buffer: defaultBuffer,
      successMessage: "Рабочее время по умолчанию сохранено.",
    });
  };

  const applyTemplate = async (scope: "MONTH" | "YEAR"): Promise<void> => {
    if (!isValidTime(templateStart) || !isValidTime(templateEnd)) {
      setError("Invalid time format.");
      return;
    }
    if (templateStart >= templateEnd) {
      setError("Start time must be before end time.");
      return;
    }

    setGeneratorBusy(true);
    setError(null);
    setActionInfo(null);
    try {
      const normalizedBuffer = Number.isFinite(defaultBuffer)
        ? Math.max(0, Math.floor(defaultBuffer / 5) * 5)
        : 0;
      setDefaultBuffer(normalizedBuffer);

      const workdayTemplate = {
        isWorkday: true,
        startLocal: templateStart,
        endLocal: templateEnd,
        breaks: [],
      };
      const dayOffTemplate = {
        isWorkday: false,
        startLocal: null,
        endLocal: null,
        breaks: [],
      };

      const body =
        templateMode === "EVERY_DAY"
          ? {
              kind: "WEEKLY" as const,
              bufferBetweenBookingsMin: normalizedBuffer,
              payload: {
                weekly: Array.from({ length: 7 }, (_, dayOfWeek) => ({
                  dayOfWeek,
                  ...workdayTemplate,
                })),
              },
            }
          : {
              kind: "CYCLE" as const,
              anchorDate: cycleStartDate,
              bufferBetweenBookingsMin: normalizedBuffer,
              payload: {
                cycle: {
                  days:
                    templateMode === "2_2"
                      ? [workdayTemplate, workdayTemplate, dayOffTemplate, dayOffTemplate]
                      : templateMode === "3_3"
                        ? [
                            workdayTemplate,
                            workdayTemplate,
                            workdayTemplate,
                            dayOffTemplate,
                            dayOffTemplate,
                            dayOffTemplate,
                          ]
                        : [
                            workdayTemplate,
                            workdayTemplate,
                            workdayTemplate,
                            workdayTemplate,
                            workdayTemplate,
                            dayOffTemplate,
                            dayOffTemplate,
                          ],
                },
              },
            };

      const res = await fetch("/api/master/schedule/rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }

      await load();
      const scopeLabel = scope === "MONTH" ? "current month" : "year";
      setActionInfo(`Template applied for ${scopeLabel}: active rule updated.`);
      setGeneratorOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply template");
    } finally {
      setGeneratorBusy(false);
    }
  };

  const createOffday = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setActionInfo(null);
    try {
      const res = await fetch("/api/master/schedule/exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: selectedDate, type: "OFF" }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ applied: boolean; requestId?: string; exceptionId?: string }>
        | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setActionInfo(json.data.applied ? "Выходной добавлен." : "Запрос отправлен администратору.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось добавить выходной");
    } finally {
      setBusy(false);
    }
  };

  const createShift = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setActionInfo(null);
    try {
      const res = await fetch("/api/master/schedule/exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          type: "SHIFT",
          startTime: shiftStart,
          endTime: shiftEnd,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ applied: boolean; requestId?: string; exceptionId?: string }>
        | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setActionInfo(json.data.applied ? "Рабочее время изменено." : "Запрос на изменение времени отправлен.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось изменить рабочее время");
    } finally {
      setBusy(false);
    }
  };

  const addBreakDraft = (): void => {
    setBreakDrafts((current) => [
      ...current,
      { id: makeDraftId(), startTime: "13:00", endTime: "14:00", note: "" },
    ]);
  };

  const updateBreakDraft = (id: string, patch: Partial<BreakDraft>): void => {
    setBreakDrafts((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeBreakDraft = (id: string): void => {
    setBreakDrafts((current) => current.filter((item) => item.id !== id));
  };

  const createBreak = async (draft: BreakDraft): Promise<void> => {
    setBusy(true);
    setError(null);
    setActionInfo(null);
    try {
      const res = await fetch("/api/master/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAt: toIsoWithTime(selectedDate, draft.startTime),
          endAt: toIsoWithTime(selectedDate, draft.endTime),
          type: "BREAK",
          note: draft.note.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ applied: boolean; blockId?: string; requestId?: string }>
        | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setActionInfo(json.data.applied ? "Перерыв добавлен." : "Запрос на перерыв отправлен.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось добавить перерыв");
    } finally {
      setBusy(false);
    }
  };

  const removeException = async (id: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/schedule/exceptions/${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить исключение");
    } finally {
      setBusy(false);
    }
  };

  const removeBlock = async (id: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/blocks/${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить перерыв");
    } finally {
      setBusy(false);
    }
  };

  const templateSummary = `Текущий график: ${TEMPLATE_MODE_LABEL[templateMode]}, ${templateStart}–${templateEnd}`;
  const selectedDateTitle = formatDateTitle(selectedDate);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Мой график</h2>
        <p className="text-sm text-text-sec">
          Управляйте временем: выходные, изменения рабочего времени и перерывы. {data.isSolo ? "SOLO: применяется сразу." : "STUDIO: отправляется запрос."}
        </p>
      </header>

      <div className="lux-card rounded-[24px] p-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMonth((m) => monthShift(m, -1))} className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm">
            &lt;
          </button>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="lux-input rounded-lg px-3 py-2 text-sm"
          />
          <button type="button" onClick={() => setMonth((m) => monthShift(m, 1))} className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm">
            &gt;
          </button>
          <button type="button" onClick={() => void load()} className="rounded-lg border border-border-subtle bg-bg-input px-2.5 py-2 text-sm" aria-label="Обновить">
            ↻
          </button>
        </div>
      </div>

      {loading ? <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">Загрузка...</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {actionInfo ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{actionInfo}</div> : null}

      {!loading ? (
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
          <div className="space-y-3">
            <section className="lux-card rounded-[24px] p-4">
              <button
                type="button"
                onClick={() => setGeneratorOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div>
                  <h3 className="text-sm font-semibold">Генератор графика</h3>
                  <div className="mt-1 text-xs text-text-sec">
                    {generatorOpen ? "Настройте шаблон и сразу просматривайте результат в календаре." : `${templateSummary} (Изменить)`}
                  </div>
                </div>
                <span className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-sm">
                  {generatorOpen ? "−" : "+"}
                </span>
              </button>

              {generatorOpen ? (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setGeneratorTab("TEMPLATE")}
                      className={`rounded-lg border px-3 py-1.5 text-sm ${
                        generatorTab === "TEMPLATE"
                          ? "border-primary/50 bg-primary/10 text-text-main"
                          : "border-border-subtle bg-bg-input text-text-sec"
                      }`}
                    >
                      Шаблон
                    </button>
                    <button
                      type="button"
                      onClick={() => setGeneratorTab("MANUAL")}
                      className={`rounded-lg border px-3 py-1.5 text-sm ${
                        generatorTab === "MANUAL"
                          ? "border-primary/50 bg-primary/10 text-text-main"
                          : "border-border-subtle bg-bg-input text-text-sec"
                      }`}
                    >
                      Вручную
                    </button>
                  </div>

                  {generatorTab === "TEMPLATE" ? (
                    <div className="space-y-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <label className="text-xs text-text-sec">
                          Схема
                          <select
                            value={templateMode}
                            onChange={(event) => setTemplateMode(event.target.value as TemplateMode)}
                            className="lux-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                          >
                            <option value="2_2">2/2</option>
                            <option value="3_3">3/3</option>
                            <option value="5_2">5/2</option>
                            <option value="EVERY_DAY">Каждый день</option>
                          </select>
                        </label>
                        <label className="text-xs text-text-sec">
                          Дата старта цикла
                          <input
                            type="date"
                            value={cycleStartDate}
                            onChange={(event) => setCycleStartDate(event.target.value)}
                            className="lux-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                          />
                        </label>
                      </div>

                      <div className="grid gap-2 md:grid-cols-2">
                        <label className="text-xs text-text-sec">
                          Время начала
                          <input
                            type="time"
                            step={300}
                            value={templateStart}
                            onChange={(event) => setTemplateStart(event.target.value)}
                            className="lux-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-xs text-text-sec">
                          Время окончания
                          <input
                            type="time"
                            step={300}
                            value={templateEnd}
                            onChange={(event) => setTemplateEnd(event.target.value)}
                            className="lux-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                          />
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void applyTemplate("MONTH")}
                          disabled={generatorBusy || savingDefaults}
                          className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm transition hover:bg-bg-card disabled:opacity-60"
                        >
                          {generatorBusy ? "Применяем..." : "Применить на текущий месяц"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void applyTemplate("YEAR")}
                          disabled={generatorBusy || savingDefaults}
                          className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm transition hover:bg-bg-card disabled:opacity-60"
                        >
                          {generatorBusy ? "Применяем..." : "Применить на год"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Рабочее время по умолчанию</h4>
                      <div className="grid gap-2 md:grid-cols-3">
                        <label className="text-xs text-text-sec">
                          Начало
                          <input
                            type="time"
                            step={300}
                            value={defaultStart}
                            onChange={(event) => setDefaultStart(event.target.value)}
                            className="lux-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-xs text-text-sec">
                          Конец
                          <input
                            type="time"
                            step={300}
                            value={defaultEnd}
                            onChange={(event) => setDefaultEnd(event.target.value)}
                            className="lux-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="text-xs text-text-sec">
                          Перерыв между записями
                          <input
                            type="number"
                            min={0}
                            max={30}
                            step={5}
                            value={defaultBuffer}
                            onChange={(event) => {
                              const parsed = Number(event.target.value);
                              setDefaultBuffer(Number.isFinite(parsed) ? parsed : 0);
                              setBufferError(null);
                            }}
                            onBlur={() => {
                              if (!Number.isFinite(defaultBuffer) || defaultBuffer < 0) {
                                setBufferError("Укажите корректный буфер от 0 минут.");
                                return;
                              }
                              const normalized = Math.floor(defaultBuffer / 5) * 5;
                              setDefaultBuffer(normalized);
                              setBufferError(null);
                            }}
                            className="lux-input mt-1 w-full rounded-lg px-3 py-2 text-sm"
                            placeholder="10"
                          />
                        </label>
                      </div>
                      {bufferError ? <div className="text-xs text-red-600">{bufferError}</div> : null}
                      <button
                        type="button"
                        onClick={() => void saveDefaultWorkingTime()}
                        disabled={savingDefaults}
                        className="rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm transition hover:bg-bg-card disabled:opacity-60"
                      >
                        {savingDefaults ? "Сохраняем..." : "Сохранить рабочее время"}
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </section>

            <section className="lux-card rounded-[24px] p-4">
              <h3 className="mb-1 text-sm font-semibold">Календарь</h3>
              <p className="mb-3 text-xs text-text-sec">
                Нагрузка по записям и live preview выбранного шаблона.
              </p>
              <div className="rounded-2xl bg-border-subtle/35 p-2">
                <div className="grid grid-cols-7 gap-2">
                  {monthDays.map((day) => {
                    const count = dayLoadMap.get(day) ?? 0;
                    const isTemplateWorkday = previewByDay.get(day) ?? true;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setSelectedDate(day)}
                        className={`rounded-xl border border-border-subtle/70 p-2 text-left text-xs transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card ${dayLoadClass(count)} ${
                          selectedDate === day ? "border-primary/60 ring-1 ring-primary/35" : ""
                        } ${isTemplateWorkday ? "shadow-[inset_0_0_0_1px_rgba(16,185,129,0.25)]" : "shadow-[inset_0_0_0_1px_rgba(244,63,94,0.25)]"}`}
                      >
                        <div className="font-medium">{day.slice(8, 10)}</div>
                        <div className="text-text-sec">{count > 0 ? `${count} записей` : ""}</div>
                        <div className={`mt-1 text-[10px] ${isTemplateWorkday ? "text-emerald-700/80" : "text-rose-700/80"}`}>
                          {isTemplateWorkday ? "Шаблон: рабочий" : "Шаблон: выходной"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-3">
            <section className="lux-card rounded-[24px] p-4">
              <h3 className="text-sm font-semibold">Действия с выбранным днем</h3>
              <div className="mt-1 text-xs text-text-sec">{selectedDateTitle}</div>
              <div className="mt-2 space-y-2">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="lux-input w-full rounded-lg px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void createOffday()}
                  disabled={busy}
                  className="w-full rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm transition hover:bg-bg-card disabled:opacity-60"
                >
                  Сделать выходным (исключение)
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={shiftStart}
                    onChange={(event) => setShiftStart(event.target.value)}
                    className="lux-input rounded-lg px-3 py-2 text-sm"
                    placeholder="10:00"
                  />
                  <input
                    type="text"
                    value={shiftEnd}
                    onChange={(event) => setShiftEnd(event.target.value)}
                    className="lux-input rounded-lg px-3 py-2 text-sm"
                    placeholder="19:00"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void createShift()}
                  disabled={busy}
                  className="w-full rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm transition hover:bg-bg-card disabled:opacity-60"
                >
                  Изменить время только для этого дня
                </button>
              </div>
            </section>

            <section className="lux-card rounded-[24px] p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Перерывы</h3>
                <button
                  type="button"
                  onClick={addBreakDraft}
                  className="rounded-lg border border-border-subtle bg-bg-input px-2 py-1 text-sm"
                >
                  +
                </button>
              </div>

              <div className="space-y-3">
                {breakDrafts.map((draft) => (
                  <div key={draft.id} className="rounded-xl border border-border-subtle bg-bg-input/70 p-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={draft.startTime}
                        onChange={(event) =>
                          updateBreakDraft(draft.id, { startTime: event.target.value })
                        }
                        className="lux-input rounded px-2 py-1 text-sm"
                        placeholder="13:00"
                      />
                      <input
                        type="text"
                        value={draft.endTime}
                        onChange={(event) =>
                          updateBreakDraft(draft.id, { endTime: event.target.value })
                        }
                        className="lux-input rounded px-2 py-1 text-sm"
                        placeholder="14:00"
                      />
                    </div>
                    <input
                      type="text"
                      value={draft.note}
                      onChange={(event) => updateBreakDraft(draft.id, { note: event.target.value })}
                      placeholder="Комментарий"
                      className="lux-input mt-2 w-full rounded px-2 py-1 text-sm"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void createBreak(draft)}
                        disabled={busy}
                        className="rounded border border-border-subtle bg-bg-card px-2 py-1 text-xs disabled:opacity-60"
                      >
                        Сохранить перерыв
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBreakDraft(draft.id)}
                        className="rounded border border-border-subtle bg-bg-card px-2 py-1 text-xs text-red-600"
                      >
                        Удалить черновик
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 space-y-2 text-sm">
                {selectedDayBreaks.length === 0 ? (
                  <div className="text-text-sec">На выбранный день перерывов нет.</div>
                ) : (
                  selectedDayBreaks.map((item) => {
                    const start = new Date(item.startAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const end = new Date(item.endAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-border-subtle bg-bg-input/60 px-2 py-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            {start} — {end}
                          </div>
                          <button
                            type="button"
                            onClick={() => void removeBlock(item.id)}
                            className="text-red-600"
                          >
                            удалить
                          </button>
                        </div>
                        <div className="text-xs text-text-sec">{item.note || "Без комментария"}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="lux-card rounded-[24px] p-4">
              <h3 className="text-sm font-semibold">Изменения в графике</h3>
              <div className="mt-2 space-y-1 text-sm">
                {data.exceptions.length === 0 ? (
                  <div className="text-text-sec">Нет исключений.</div>
                ) : (
                  data.exceptions.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-input/70 px-2 py-1"
                    >
                      <span>
                        {item.date} · {item.type}
                        {item.startTime && item.endTime ? ` (${item.startTime}-${item.endTime})` : ""}
                      </span>
                      {data.isSolo ? (
                        <button
                          type="button"
                          onClick={() => void removeException(item.id)}
                          className="text-red-600"
                        >
                          удалить
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            {!data.isSolo ? (
              <section className="lux-card rounded-[24px] p-4">
                <h3 className="text-sm font-semibold">Мои requests</h3>
                <div className="mt-2 space-y-1 text-sm">
                  {data.requests.length === 0 ? (
                    <div className="text-text-sec">Запросов пока нет.</div>
                  ) : (
                    data.requests.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-border-subtle bg-bg-input/70 px-2 py-1"
                      >
                        {item.type} · {item.status} · {new Date(item.createdAt).toLocaleString()}
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
