"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import { ScheduleOverridesPanel } from "@/features/cabinet/components/schedule-overrides-panel";
import { ScheduleBlocksPanel } from "@/features/cabinet/components/schedule-blocks-panel";

type WeeklyItem = {
  dayOfWeek: number;
  startLocal: string;
  endLocal: string;
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

  const weeklyEndpoint = useMemo(() => `/api/masters/${masterId}/schedule/weekly`, [masterId]);
  const overridesEndpoint = useMemo(() => `/api/masters/${masterId}/schedule/overrides`, [masterId]);
  const blocksEndpoint = useMemo(() => `/api/masters/${masterId}/schedule/blocks`, [masterId]);

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

  const rows = useMemo(() => {
    const byDay = new Map(items.map((i) => [i.dayOfWeek, i]));
    return dayLabels.map((label, dayOfWeek) => {
      const found = byDay.get(dayOfWeek) ?? { dayOfWeek, startLocal: "09:00", endLocal: "18:00" };
      return { label, ...found, enabled: byDay.has(dayOfWeek) };
    });
  }, [items]);

  const [draft, setDraft] = useState(rows);

  useEffect(() => {
    setDraft(rows);
  }, [rows]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = draft
        .filter((r) => r.enabled)
        .map((r) => ({ dayOfWeek: r.dayOfWeek, startLocal: r.startLocal, endLocal: r.endLocal }));

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

  if (loading) {
    return <div className="rounded-2xl border p-5 text-sm text-neutral-600">Загрузка расписания…</div>;
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border p-4 text-sm text-red-600">Ошибка: {error}</div>
      ) : null}

      <div className="rounded-2xl border divide-y">
        {draft.map((row, idx) => (
          <div key={row.dayOfWeek} className="flex items-center gap-3 p-3">
            <label className="flex items-center gap-2 w-16">
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

      <div className="grid gap-4 lg:grid-cols-2">
        <ScheduleOverridesPanel endpoint={overridesEndpoint} />
        <ScheduleBlocksPanel endpoint={blocksEndpoint} />
      </div>
    </div>
  );
}
