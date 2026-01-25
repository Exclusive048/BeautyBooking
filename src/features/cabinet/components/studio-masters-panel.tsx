"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

type MasterItem = {
  id: string;
  name: string;
  studioId: string | null;
};

type Props = {
  studioId: string;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function StudioMastersPanel({ studioId }: Props) {
  const [items, setItems] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [masterId, setMasterId] = useState("");
  const [saving, setSaving] = useState(false);

  const endpoint = useMemo(() => `/api/studios/${studioId}/masters`, [studioId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ masters: MasterItem[] }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, `API error: ${res.status}`));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to load masters"));
      setItems(json.data.masters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const attach = async () => {
    if (!masterId.trim()) {
      setError("Укажите ID мастера");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterProviderId: masterId.trim() }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ master: MasterItem }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to attach master"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to attach master"));
      setItems((prev) => [...prev, json.data.master]);
      setMasterId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const detach = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterProviderId: id }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ master: MasterItem }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to detach master"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to detach master"));
      setItems((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border p-5 text-sm text-neutral-600">Загрузка мастеров…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4 space-y-3">
        <div className="text-sm font-semibold">Добавить мастера в студию</div>
        <div className="flex flex-wrap gap-3">
          <input
            className="rounded-xl border px-3 py-2 text-sm flex-1 min-w-[200px]"
            placeholder="ID мастера"
            value={masterId}
            onChange={(e) => setMasterId(e.target.value)}
          />
          <button
            type="button"
            onClick={attach}
            disabled={saving}
            className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Добавить
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border p-4 text-sm text-red-600">Ошибка: {error}</div>
      ) : null}

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border p-4 text-sm text-neutral-600">
            Мастеров пока нет.
          </div>
        ) : (
          items.map((m) => (
            <div key={m.id} className="rounded-2xl border p-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-neutral-500">{m.id}</div>
              </div>
              <button
                type="button"
                onClick={() => detach(m.id)}
                disabled={saving}
                className="rounded-xl border px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Удалить
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
