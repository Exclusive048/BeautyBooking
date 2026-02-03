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
  if (count >= 6) return "bg-emerald-200";
  if (count >= 3) return "bg-emerald-100";
  if (count >= 1) return "bg-emerald-50";
  return "bg-white";
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
  const [bufferHint, setBufferHint] = useState<string | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);

  const [breakDrafts, setBreakDrafts] = useState<BreakDraft[]>([
    { id: makeDraftId(), startTime: "13:00", endTime: "14:00", note: "" },
  ]);

  const dayLoadMap = useMemo(() => {
    const map = new Map<string, number>();
    data.dayLoads.forEach((item) => map.set(item.date, item.count));
    return map;
  }, [data.dayLoads]);

  const monthDays = useMemo(() => {
    const first = new Date(`${month}-01T00:00:00.000Z`);
    const next = new Date(first);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const days: string[] = [];
    for (let cursor = new Date(first); cursor < next; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      days.push(cursor.toISOString().slice(0, 10));
    }
    return days;
  }, [month]);

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

  const saveDefaultWorkingTime = async (): Promise<void> => {
    if (!data.masterId) return;
    if (!isValidTime(defaultStart) || !isValidTime(defaultEnd)) {
      setError("Некорректный формат времени.");
      return;
    }
    if (defaultStart >= defaultEnd) {
      setError("Начало должно быть раньше конца.");
      return;
    }
    if (!Number.isFinite(defaultBuffer) || defaultBuffer < 0) {
      setBufferError("Укажите корректный буфер от 0 минут.");
      return;
    }

    const normalizedBuffer = Math.floor(defaultBuffer / 5) * 5;
    setDefaultBuffer(normalizedBuffer);
    setBufferError(null);
    setBufferHint(normalizedBuffer !== defaultBuffer ? "Буфер нормализован до кратного 5 минутам." : "Буфер кратен 5 минутам.");

    setSavingDefaults(true);
    setError(null);
    setActionInfo(null);
    try {
      const weeklyBody = Array.from({ length: 7 }).map((_, day) => ({
        dayOfWeek: day,
        startLocal: defaultStart,
        endLocal: defaultEnd,
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
        const message = weeklyJson && !weeklyJson.ok ? toFriendlyError(weeklyJson.error.message) : `API error: ${weeklyRes.status}`;
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
        const message = bufferJson && !bufferJson.ok ? toFriendlyError(bufferJson.error.message) : `API error: ${bufferRes.status}`;
        throw new Error(message);
      }

      await load();
      setActionInfo("Рабочее время по умолчанию сохранено.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить рабочее время по умолчанию");
    } finally {
      setSavingDefaults(false);
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

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Мой график</h2>
        <p className="text-sm text-neutral-600">
          Управляйте временем: выходные, изменения рабочего времени и перерывы. {data.isSolo ? "SOLO: применяется сразу." : "STUDIO: отправляется запрос."}
        </p>
      </header>

      <div className="rounded-2xl border p-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMonth((m) => monthShift(m, -1))} className="rounded-lg border px-3 py-2 text-sm">
            &lt;
          </button>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <button type="button" onClick={() => setMonth((m) => monthShift(m, 1))} className="rounded-lg border px-3 py-2 text-sm">
            &gt;
          </button>
          <button type="button" onClick={() => void load()} className="rounded-lg border px-2.5 py-2 text-sm" aria-label="Обновить">
            ↻
          </button>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border p-5 text-sm">Загрузка...</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {actionInfo ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{actionInfo}</div> : null}

      {!loading ? (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border p-4">
            <h3 className="mb-3 text-sm font-semibold">Календарь месяца (нагрузка)</h3>
            <div className="grid grid-cols-7 gap-2">
              {monthDays.map((day) => {
                const count = dayLoadMap.get(day) ?? 0;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDate(day)}
                    className={`rounded-lg border p-2 text-left text-xs ${dayLoadClass(count)} ${
                      selectedDate === day ? "border-black" : "border-neutral-200"
                    }`}
                  >
                    <div>{day.slice(8, 10)}</div>
                    <div className="text-neutral-600">{count} записей</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <section className="rounded-2xl border p-4">
              <h3 className="text-sm font-semibold">Рабочее время по умолчанию</h3>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label className="text-xs text-muted-foreground">
                  Начало
                  <input type="time" step={300} value={defaultStart} onChange={(event) => setDefaultStart(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-muted-foreground">
                  Конец
                  <input type="time" step={300} value={defaultEnd} onChange={(event) => setDefaultEnd(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
                </label>
                <label className="text-xs text-muted-foreground">
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
                      setBufferHint("Буфер кратен 5 минутам.");
                    }}
                    onBlur={() => {
                      if (!Number.isFinite(defaultBuffer) || defaultBuffer < 0) {
                        setBufferError("Укажите корректный буфер от 0 минут.");
                        return;
                      }
                      const normalized = Math.floor(defaultBuffer / 5) * 5;
                      setDefaultBuffer(normalized);
                      setBufferError(null);
                      setBufferHint(
                        normalized !== defaultBuffer
                          ? "Буфер нормализован до кратного 5 минутам."
                          : "Буфер кратен 5 минутам."
                      );
                    }}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    placeholder="10"
                  />
                </label>
              </div>
              {bufferError ? <div className="mt-1 text-xs text-red-600">{bufferError}</div> : null}
              {bufferHint ? <div className="mt-1 text-xs text-muted-foreground">{bufferHint}</div> : null}
              <button
                type="button"
                onClick={() => void saveDefaultWorkingTime()}
                disabled={savingDefaults}
                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm disabled:opacity-60"
              >
                {savingDefaults ? "Сохраняем..." : "Сохранить рабочее время по умолчанию"}
              </button>
            </section>

            <section className="rounded-2xl border p-4">
              <h3 className="text-sm font-semibold">Действия</h3>
              <div className="mt-2 space-y-2">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
                <button type="button" onClick={() => void createOffday()} disabled={busy} className="w-full rounded-lg border px-3 py-2 text-sm">
                  🏖️ Взять выходной
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <input type="text" value={shiftStart} onChange={(event) => setShiftStart(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" placeholder="10:00" />
                  <input type="text" value={shiftEnd} onChange={(event) => setShiftEnd(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" placeholder="19:00" />
                </div>
                <button type="button" onClick={() => void createShift()} disabled={busy} className="w-full rounded-lg border px-3 py-2 text-sm">
                  🌓 Изменить рабочее время
                </button>
              </div>
            </section>

            <section className="rounded-2xl border p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Перерывы на выбранный день</h3>
                <button type="button" onClick={addBreakDraft} className="rounded-lg border px-2 py-1 text-sm">
                  +
                </button>
              </div>

              <div className="space-y-3">
                {breakDrafts.map((draft) => (
                  <div key={draft.id} className="rounded-lg border p-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" value={draft.startTime} onChange={(event) => updateBreakDraft(draft.id, { startTime: event.target.value })} className="rounded border px-2 py-1 text-sm" placeholder="13:00" />
                      <input type="text" value={draft.endTime} onChange={(event) => updateBreakDraft(draft.id, { endTime: event.target.value })} className="rounded border px-2 py-1 text-sm" placeholder="14:00" />
                    </div>
                    <input type="text" value={draft.note} onChange={(event) => updateBreakDraft(draft.id, { note: event.target.value })} placeholder="Комментарий" className="mt-2 w-full rounded border px-2 py-1 text-sm" />
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => void createBreak(draft)} disabled={busy} className="rounded border px-2 py-1 text-xs">
                        Сохранить перерыв
                      </button>
                      <button type="button" onClick={() => removeBreakDraft(draft.id)} className="rounded border px-2 py-1 text-xs text-red-600">
                        Удалить черновик
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 space-y-2 text-sm">
                {selectedDayBreaks.length === 0 ? (
                  <div className="text-neutral-500">На выбранный день перерывов нет.</div>
                ) : (
                  selectedDayBreaks.map((item) => {
                    const start = new Date(item.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    const end = new Date(item.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={item.id} className="rounded border px-2 py-2">
                        <div className="flex items-center justify-between">
                          <div>{start} — {end}</div>
                          <button type="button" onClick={() => void removeBlock(item.id)} className="text-red-600">
                            удалить
                          </button>
                        </div>
                        <div className="text-xs text-neutral-500">{item.note || "Без комментария"}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="rounded-2xl border p-4">
              <h3 className="text-sm font-semibold">Исключения</h3>
              <div className="mt-2 space-y-1 text-sm">
                {data.exceptions.length === 0 ? (
                  <div className="text-neutral-500">Нет исключений.</div>
                ) : (
                  data.exceptions.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded border px-2 py-1">
                      <span>
                        {item.date} · {item.type}
                        {item.startTime && item.endTime ? ` (${item.startTime}-${item.endTime})` : ""}
                      </span>
                      {data.isSolo ? (
                        <button type="button" onClick={() => void removeException(item.id)} className="text-red-600">
                          удалить
                        </button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            {!data.isSolo ? (
              <section className="rounded-2xl border p-4">
                <h3 className="text-sm font-semibold">Мои requests</h3>
                <div className="mt-2 space-y-1 text-sm">
                  {data.requests.length === 0 ? (
                    <div className="text-neutral-500">Запросов пока нет.</div>
                  ) : (
                    data.requests.map((item) => (
                      <div key={item.id} className="rounded border px-2 py-1">
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
