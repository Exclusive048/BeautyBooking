"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import { ScheduleExceptionsPanel } from "@/features/cabinet/components/schedule-exceptions-panel";
import { timeToMinutes } from "@/lib/schedule/time";

type BreakItem = {
  startLocal: string;
  endLocal: string;
};

type WeeklyItem = {
  dayOfWeek: number;
  startLocal: string;
  endLocal: string;
  breaks?: BreakItem[];
};

type RowItem = WeeklyItem & {
  label: string;
  enabled: boolean;
  breaks: BreakItem[];
};

type Props = {
  masterId: string;
};

const dayLabels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function MasterSchedulePanel({ masterId }: Props) {
  const [items, setItems] = useState<WeeklyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bufferMin, setBufferMin] = useState(0);
  const [bufferLoading, setBufferLoading] = useState(true);
  const [bufferSaving, setBufferSaving] = useState(false);
  const [bufferError, setBufferError] = useState<string | null>(null);

  const weeklyEndpoint = useMemo(() => `/api/masters/${masterId}/schedule/weekly`, [masterId]);
  const overridesEndpoint = useMemo(() => `/api/masters/${masterId}/schedule/overrides`, [masterId]);
  const blocksEndpoint = useMemo(() => `/api/masters/${masterId}/schedule/blocks`, [masterId]);
  const bufferEndpoint = useMemo(() => `/api/masters/${masterId}/schedule/buffer`, [masterId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(weeklyEndpoint, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ items: WeeklyItem[] }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, `API error: ${res.status}`));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to load schedule"));
      setItems(json.data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [weeklyEndpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadBuffer = useCallback(async () => {
    setBufferLoading(true);
    setBufferError(null);
    try {
      const res = await fetch(bufferEndpoint, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ bufferBetweenBookingsMin: number }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to load buffer"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to load buffer"));
      setBufferMin(json.data.bufferBetweenBookingsMin ?? 0);
    } catch (e) {
      setBufferError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBufferLoading(false);
    }
  }, [bufferEndpoint]);

  useEffect(() => {
    void loadBuffer();
  }, [loadBuffer]);

  const rows = useMemo<RowItem[]>(() => {
    const byDay = new Map(items.map((i) => [i.dayOfWeek, i]));
    return dayLabels.map((label, dayOfWeek) => {
      const found = byDay.get(dayOfWeek) ?? { dayOfWeek, startLocal: "09:00", endLocal: "18:00" };
      return {
        label,
        ...found,
        breaks: found.breaks ?? [],
        enabled: byDay.has(dayOfWeek),
      };
    });
  }, [items]);

  const [draft, setDraft] = useState(rows);

  useEffect(() => {
    setDraft(rows);
  }, [rows]);

  const buildDefaultBreak = (row: WeeklyItem): BreakItem => {
    const dayStart = timeToMinutes(row.startLocal);
    const dayEnd = timeToMinutes(row.endLocal);
    if (dayStart === null || dayEnd === null || dayEnd - dayStart < 60) {
      return { startLocal: "13:00", endLocal: "14:00" };
    }
    const startMin = Math.min(dayStart + 180, dayEnd - 60);
    const endMin = Math.min(startMin + 60, dayEnd - 1);
    const pad = (v: number) => String(v).padStart(2, "0");
    return {
      startLocal: `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}`,
      endLocal: `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`,
    };
  };

  const validateRowBreaks = (row: RowItem) => {
    if (!row.enabled) return null;
    const dayStart = timeToMinutes(row.startLocal);
    const dayEnd = timeToMinutes(row.endLocal);
    if (dayStart === null || dayEnd === null || dayStart >= dayEnd) {
      return `Некорректный интервал рабочего дня (${row.label})`;
    }

    if (row.breaks.length > 3) {
      return `Слишком много перерывов (${row.label})`;
    }

    const parsed = row.breaks.map((b) => ({
      start: timeToMinutes(b.startLocal),
      end: timeToMinutes(b.endLocal),
    }));

    for (const b of parsed) {
      if (b.start === null || b.end === null || b.start >= b.end) {
        return `Некорректный перерыв (${row.label})`;
      }
      if (b.start <= dayStart || b.end >= dayEnd) {
        return `Перерыв вне рабочего окна (${row.label})`;
      }
    }

    const sorted = parsed.slice().sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev.start === null || prev.end === null || curr.start === null || curr.end === null) {
        continue;
      }
      if (curr.start < prev.end) {
        return `Перерывы пересекаются (${row.label})`;
      }
    }

    return null;
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const row of draft) {
        const validationError = validateRowBreaks(row);
        if (validationError) {
          setError(validationError);
          setSaving(false);
          return;
        }
      }

      const payload = draft
        .filter((r) => r.enabled)
        .map((r) => ({
          dayOfWeek: r.dayOfWeek,
          startLocal: r.startLocal,
          endLocal: r.endLocal,
          breaks: r.breaks ?? [],
        }));

      const res = await fetch(weeklyEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ count: number }> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to save schedule"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to save schedule"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const saveBuffer = async () => {
    setBufferSaving(true);
    setBufferError(null);
    try {
      const res = await fetch(bufferEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bufferBetweenBookingsMin: bufferMin }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ bufferBetweenBookingsMin: number }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to save buffer"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to save buffer"));
      setBufferMin(json.data.bufferBetweenBookingsMin ?? 0);
    } catch (e) {
      setBufferError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBufferSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border p-5 text-sm text-neutral-600">Загрузка расписания...</div>;
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border p-4 text-sm text-red-600">Ошибка: {error}</div>
      ) : null}

      <div className="rounded-2xl border p-4 space-y-3">
        <div className="text-sm font-semibold">Буфер между записями</div>
        {bufferError ? (
          <div className="rounded-xl border p-3 text-sm text-red-600">Ошибка: {bufferError}</div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="number"
            min={0}
            max={30}
            step={5}
            className="rounded-lg border px-2 py-1 text-sm w-24"
            value={bufferMin}
            onChange={(e) => setBufferMin(Number(e.target.value))}
            disabled={bufferLoading}
          />
          <span className="text-sm text-neutral-500">минут</span>
          <button
            type="button"
            onClick={saveBuffer}
            disabled={bufferSaving || bufferLoading}
            className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {bufferSaving ? "Сохраняем..." : "Сохранить буфер"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border divide-y">
        {draft.map((row, idx) => (
          <div key={row.dayOfWeek} className="flex flex-wrap items-start gap-3 p-3">
            <label className="flex items-center gap-2 w-16 shrink-0">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev.map((item, i) =>
                      i === idx ? { ...item, enabled: e.target.checked } : item
                    )
                  )
                }
              />
              <span className="text-sm">{row.label}</span>
            </label>

            <div className="flex items-center gap-2">
              <input
                className="rounded-lg border px-2 py-1 text-sm w-24"
                value={row.startLocal}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev.map((item, i) =>
                      i === idx ? { ...item, startLocal: e.target.value } : item
                    )
                  )
                }
                disabled={!row.enabled}
              />
              <span className="text-sm text-neutral-500">—</span>
              <input
                className="rounded-lg border px-2 py-1 text-sm w-24"
                value={row.endLocal}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev.map((item, i) =>
                      i === idx ? { ...item, endLocal: e.target.value } : item
                    )
                  )
                }
                disabled={!row.enabled}
              />
            </div>

            <div className="flex-1 min-w-[220px]">
              <div className="text-xs font-medium text-neutral-500">Перерывы</div>
              {row.enabled ? (
                <div className="mt-2 space-y-2">
                  {row.breaks.map((br, bIdx) => (
                    <div key={`${row.dayOfWeek}-${bIdx}`} className="flex flex-wrap items-center gap-2">
                      <input
                        className="rounded-lg border px-2 py-1 text-sm w-24"
                        value={br.startLocal}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? {
                                    ...item,
                                    breaks: item.breaks.map((b, bi) =>
                                      bi === bIdx ? { ...b, startLocal: e.target.value } : b
                                    ),
                                  }
                                : item
                            )
                          )
                        }
                      />
                      <span className="text-sm text-neutral-500">—</span>
                      <input
                        className="rounded-lg border px-2 py-1 text-sm w-24"
                        value={br.endLocal}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? {
                                    ...item,
                                    breaks: item.breaks.map((b, bi) =>
                                      bi === bIdx ? { ...b, endLocal: e.target.value } : b
                                    ),
                                  }
                                : item
                            )
                          )
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, breaks: item.breaks.filter((_, bi) => bi !== bIdx) }
                                : item
                            )
                          )
                        }
                        className="rounded-lg border px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Удалить
                      </button>
                    </div>
                  ))}

                  {row.breaks.length < 3 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? { ...item, breaks: [...item.breaks, buildDefaultBreak(item)] }
                              : item
                          )
                        )
                      }
                      className="text-xs font-medium text-neutral-700 hover:underline"
                    >
                      + Добавить перерыв
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2 text-xs text-neutral-400">Недоступно в выходной</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {saving ? "Сохраняем..." : "Сохранить расписание"}
      </button>

      <ScheduleExceptionsPanel overridesEndpoint={overridesEndpoint} blocksEndpoint={blocksEndpoint} />
    </div>
  );
}
