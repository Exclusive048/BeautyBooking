"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

type BlockItem = {
  id: string;
  date: string;
  startLocal: string;
  endLocal: string;
  reason: string | null;
};

type Props = {
  endpoint: string;
  rangeDays?: number;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function ScheduleBlocksPanel({ endpoint, rangeDays = 14 }: Props) {
  const [items, setItems] = useState<BlockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [startLocal, setStartLocal] = useState("12:00");
  const [endLocal, setEndLocal] = useState("13:00");
  const [reason, setReason] = useState("");

  const range = useMemo(() => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + rangeDays);
    return { from, to };
  }, [rangeDays]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.set("from", range.from.toISOString());
      url.searchParams.set("to", range.to.toISOString());
      const res = await fetch(url.toString(), { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ blocks: BlockItem[] }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to load blocks"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to load blocks"));
      setItems(json.data.blocks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [endpoint, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const addBlock = async () => {
    if (!date) {
      setError("Укажите дату");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          startLocal,
          endLocal,
          reason: reason.trim() ? reason.trim() : undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ id: string }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to add block"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to add block"));
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const removeBlock = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockId: id }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ id: string }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to remove block"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to remove block"));
      setItems((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border p-5 text-sm text-neutral-600">Загрузка…</div>;
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-2xl border p-4 text-sm text-red-600">Ошибка: {error}</div>
      ) : null}

      <div className="rounded-2xl border p-4 space-y-3">
        <div className="text-sm font-semibold">Блокировка</div>
        <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr_2fr] items-center">
          <input
            type="date"
            className="rounded-xl border px-3 py-2 text-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            value={startLocal}
            onChange={(e) => setStartLocal(e.target.value)}
          />
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            value={endLocal}
            onChange={(e) => setEndLocal(e.target.value)}
          />
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Причина (опц.)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={addBlock}
          disabled={saving}
          className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Добавляем..." : "Добавить"}
        </button>
      </div>

      <div className="rounded-2xl border p-4 space-y-2">
        <div className="text-sm font-semibold">Блокировки</div>
        {items.length === 0 ? (
          <div className="text-sm text-neutral-600">Блокировок нет.</div>
        ) : (
          <div className="space-y-2">
            {items.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <span className="font-medium">{b.date.slice(0, 10)}</span> — {b.startLocal}
                  -{b.endLocal}
                  {b.reason ? ` (${b.reason})` : ""}
                </div>
                <button
                  type="button"
                  onClick={() => removeBlock(b.id)}
                  disabled={saving}
                  className="rounded-lg border px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
