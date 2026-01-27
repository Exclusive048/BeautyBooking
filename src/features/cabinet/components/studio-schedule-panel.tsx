"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import { ScheduleExceptionsPanel } from "@/features/cabinet/components/schedule-exceptions-panel";

type WeeklyItem = {
  dayOfWeek: number;
  startLocal: string;
  endLocal: string;
  breaks?: { startLocal: string; endLocal: string }[];
};

type MasterItem = {
  id: string;
  name: string;
};

type Props = {
  studioId: string;
};

const dayLabels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function StudioSchedulePanel({ studioId }: Props) {
  const [masters, setMasters] = useState<MasterItem[]>([]);
  const [selectedMasterId, setSelectedMasterId] = useState<string>("");
  const [items, setItems] = useState<WeeklyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bufferMin, setBufferMin] = useState(0);
  const [bufferLoading, setBufferLoading] = useState(true);
  const [bufferSaving, setBufferSaving] = useState(false);
  const [bufferError, setBufferError] = useState<string | null>(null);

  const mastersEndpoint = useMemo(() => `/api/studios/${studioId}/masters`, [studioId]);
  const weeklyEndpoint = useMemo(() => {
    if (!selectedMasterId) return "";
    return `/api/studios/${studioId}/masters/${selectedMasterId}/schedule/weekly`;
  }, [studioId, selectedMasterId]);
  const overridesEndpoint = useMemo(() => {
    if (!selectedMasterId) return "";
    return `/api/studios/${studioId}/masters/${selectedMasterId}/schedule/overrides`;
  }, [studioId, selectedMasterId]);
  const blocksEndpoint = useMemo(() => {
    if (!selectedMasterId) return "";
    return `/api/studios/${studioId}/masters/${selectedMasterId}/schedule/blocks`;
  }, [studioId, selectedMasterId]);
  const bufferEndpoint = useMemo(() => {
    if (!selectedMasterId) return "";
    return `/api/studios/${studioId}/masters/${selectedMasterId}/schedule/buffer`;
  }, [studioId, selectedMasterId]);

  const loadMasters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(mastersEndpoint, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ masters: MasterItem[] }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to load masters"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to load masters"));
      setMasters(json.data.masters);
      setSelectedMasterId((prev) => prev || json.data.masters[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [mastersEndpoint]);

  const loadSchedule = useCallback(async () => {
    if (!weeklyEndpoint) return;
    setError(null);
    try {
      const res = await fetch(weeklyEndpoint, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ items: WeeklyItem[] }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to load schedule"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to load schedule"));
      setItems(json.data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setItems([]);
    }
  }, [weeklyEndpoint]);

  useEffect(() => {
    void loadMasters();
  }, [loadMasters]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const loadBuffer = useCallback(async () => {
    if (!bufferEndpoint) return;
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

  useEffect(() => {
    if (!selectedMasterId) {
      setBufferMin(0);
      setBufferError(null);
    }
  }, [selectedMasterId]);

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
    if (!weeklyEndpoint) return;
    setSaving(true);
    setError(null);
    try {
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
      await loadSchedule();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const saveBuffer = async () => {
    if (!bufferEndpoint) return;
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
    return <div className="rounded-2xl border p-5 text-sm text-neutral-600">Загрузка...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4 flex flex-wrap items-center gap-3">
        <div className="text-sm font-semibold">Мастер</div>
        <select
          className="rounded-xl border px-3 py-2 text-sm"
          value={selectedMasterId}
          onChange={(e) => setSelectedMasterId(e.target.value)}
        >
          {masters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

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
            disabled={bufferLoading || !selectedMasterId}
          />
          <span className="text-sm text-neutral-500">минут</span>
          <button
            type="button"
            onClick={saveBuffer}
            disabled={bufferSaving || bufferLoading || !selectedMasterId}
            className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {bufferSaving ? "Сохраняем..." : "Сохранить буфер"}
          </button>
        </div>
      </div>

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

      {overridesEndpoint && blocksEndpoint ? (
        <ScheduleExceptionsPanel overridesEndpoint={overridesEndpoint} blocksEndpoint={blocksEndpoint} />
      ) : null}
    </div>
  );
}
