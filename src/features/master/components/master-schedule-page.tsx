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
  month: string;
  isSolo: boolean;
  dayLoads: ScheduleDayLoad[];
  exceptions: ScheduleException[];
  blocks: ScheduleBlock[];
  requests: ScheduleRequest[];
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

export function MasterSchedulePage() {
  const [month, setMonth] = useState(currentMonthKey());
  const [data, setData] = useState<ScheduleData>({
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
  const [blockStart, setBlockStart] = useState(`${currentMonthKey()}-01T13:00`);
  const [blockEnd, setBlockEnd] = useState(`${currentMonthKey()}-01T14:00`);
  const [blockNote, setBlockNote] = useState("");
  const [busy, setBusy] = useState(false);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

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
      setError(err instanceof Error ? err.message : "Failed to create off day");
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
      setActionInfo(json.data.applied ? "Смена сохранена." : "Запрос на смену отправлен.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create shift");
    } finally {
      setBusy(false);
    }
  };

  const createBreak = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setActionInfo(null);
    try {
      const res = await fetch("/api/master/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAt: new Date(blockStart).toISOString(),
          endAt: new Date(blockEnd).toISOString(),
          type: "BREAK",
          note: blockNote.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ applied: boolean; blockId?: string; requestId?: string }>
        | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API error: ${res.status}`);
      }
      setActionInfo(json.data.applied ? "Перерыв добавлен." : "Запрос на блок отправлен.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create break");
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
      setError(err instanceof Error ? err.message : "Failed to remove exception");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Мой график</h2>
        <p className="text-sm text-neutral-600">
          Управляйте временем: выходные, смены и перерывы. {data.isSolo ? "SOLO: применяется сразу." : "STUDIO: отправляется request."}
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
          <button type="button" onClick={() => void load()} className="rounded-lg border px-3 py-2 text-sm">
            Refresh
          </button>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border p-5 text-sm">Loading...</div> : null}
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
                  🌓 Сменить смену
                </button>

                <input type="datetime-local" value={blockStart} onChange={(event) => setBlockStart(event.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
                <input type="datetime-local" value={blockEnd} onChange={(event) => setBlockEnd(event.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
                <input type="text" value={blockNote} onChange={(event) => setBlockNote(event.target.value)} placeholder="Комментарий" className="w-full rounded-lg border px-3 py-2 text-sm" />
                <button type="button" onClick={() => void createBreak()} disabled={busy} className="w-full rounded-lg border px-3 py-2 text-sm">
                  ☕ Перерыв/Обед
                </button>
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

            <section className="rounded-2xl border p-4">
              <h3 className="text-sm font-semibold">Перерывы и блоки</h3>
              <div className="mt-2 space-y-1 text-sm">
                {data.blocks.length === 0 ? (
                  <div className="text-neutral-500">Нет блоков.</div>
                ) : (
                  data.blocks.map((item) => (
                    <div key={item.id} className="rounded border px-2 py-1">
                      {new Date(item.startAt).toLocaleString()} - {new Date(item.endAt).toLocaleString()} · {item.type}
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
