"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

type OverrideItem = {
  date: string;
  isDayOff: boolean;
  startLocal: string | null;
  endLocal: string | null;
};

type Props = {
  endpoint: string;
  rangeDays?: number;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function ScheduleOverridesPanel({ endpoint, rangeDays = 14 }: Props) {
  const [items, setItems] = useState<OverrideItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [isDayOff, setIsDayOff] = useState(false);
  const [startLocal, setStartLocal] = useState("09:00");
  const [endLocal, setEndLocal] = useState("18:00");

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
        | ApiResponse<{ overrides: OverrideItem[] }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to load overrides"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to load overrides"));
      setItems(json.data.overrides);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [endpoint, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!date) {
      setError("Укажите дату");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          isDayOff,
          startLocal: isDayOff ? undefined : startLocal,
          endLocal: isDayOff ? undefined : endLocal,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ override: OverrideItem }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to save override"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to save override"));
      await load();
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
        <div className="text-sm font-semibold">Спец-день</div>
        <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr_auto] items-center">
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
            disabled={isDayOff}
          />
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            value={endLocal}
            onChange={(e) => setEndLocal(e.target.value)}
            disabled={isDayOff}
          />
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDayOff}
              onChange={(e) => setIsDayOff(e.target.checked)}
            />
            Выходной
          </label>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Сохраняем..." : "Сохранить"}
        </button>
      </div>

      <div className="rounded-2xl border p-4 space-y-2">
        <div className="text-sm font-semibold">Текущие спец-дни</div>
        {items.length === 0 ? (
          <div className="text-sm text-neutral-600">Нет спец-дней в выбранном диапазоне.</div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={`${item.date}:${item.startLocal}:${item.endLocal}`} className="text-sm">
                <span className="font-medium">{item.date.slice(0, 10)}</span>{" "}
                {item.isDayOff
                  ? "— выходной"
                  : `— ${item.startLocal ?? ""}-${item.endLocal ?? ""}`}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
