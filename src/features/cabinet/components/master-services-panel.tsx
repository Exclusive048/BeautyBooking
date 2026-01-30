"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

type ServiceItem = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  isEnabled: boolean;
};

type Editable = {
  name: string;
  durationMin: string;
  price: string;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function MasterServicesPanel() {
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState<Editable>({
    name: "",
    durationMin: "",
    price: "",
  });

  const endpoint = useMemo(() => `/api/masters/me/services`, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ services: ServiceItem[] }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, `API error: ${res.status}`));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to load services"));
      setItems(json.data.services);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const toNumber = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const createService = async () => {
    const duration = toNumber(newItem.durationMin);
    const price = toNumber(newItem.price);
    if (!newItem.name.trim() || duration === null || price === null) {
      setError("Заполните название, длительность и цену");
      return;
    }
    setSavingId("new");
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newItem.name.trim(),
          durationMin: duration,
          price,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ service: ServiceItem }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to create"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to create"));
      setItems((prev) => [...prev, json.data.service]);
      setNewItem({ name: "", durationMin: "", price: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSavingId(null);
    }
  };

  const updateService = async (id: string, next: Editable) => {
    const duration = toNumber(next.durationMin);
    const price = toNumber(next.price);
    if (!next.name.trim() || duration === null || price === null) {
      setError("Заполните название, длительность и цену");
      return;
    }
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: id,
          name: next.name.trim(),
          durationMin: duration,
          price,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ service: ServiceItem }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to update"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to update"));
      setItems((prev) => prev.map((s) => (s.id === id ? json.data.service : s)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSavingId(null);
    }
  };

  const toggleService = async (id: string, isEnabled: boolean) => {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: id, isEnabled }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ service: ServiceItem }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to update"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to update"));
      setItems((prev) => prev.map((s) => (s.id === id ? json.data.service : s)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border p-5 text-sm text-neutral-600">Загрузка услуг...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4 space-y-3">
        <div className="text-sm font-semibold">Добавить услугу</div>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto]">
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Название"
            value={newItem.name}
            onChange={(e) => setNewItem((s) => ({ ...s, name: e.target.value }))}
          />
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Длительность, мин"
            value={newItem.durationMin}
            onChange={(e) => setNewItem((s) => ({ ...s, durationMin: e.target.value }))}
          />
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Цена"
            value={newItem.price}
            onChange={(e) => setNewItem((s) => ({ ...s, price: e.target.value }))}
          />
          <button
            type="button"
            onClick={createService}
            disabled={savingId === "new"}
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
        {items.map((item) => (
          <ServiceRow
            key={`${item.id}:${item.name}:${item.durationMin}:${item.price}`}
            item={item}
            disabled={savingId === item.id}
            onSave={updateService}
            onToggle={toggleService}
          />
        ))}
      </div>
    </div>
  );
}

function ServiceRow({
  item,
  disabled,
  onSave,
  onToggle,
}: {
  item: ServiceItem;
  disabled: boolean;
  onSave: (id: string, next: Editable) => void;
  onToggle: (id: string, isEnabled: boolean) => void;
}) {
  const [form, setForm] = useState<Editable>({
    name: item.name,
    durationMin: String(item.durationMin),
    price: String(item.price),
  });

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto_auto] items-center">
        <input
          className="rounded-xl border px-3 py-2 text-sm"
          value={form.name}
          onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
          disabled={disabled}
        />
        <input
          className="rounded-xl border px-3 py-2 text-sm"
          value={form.durationMin}
          onChange={(e) => setForm((s) => ({ ...s, durationMin: e.target.value }))}
          disabled={disabled}
        />
        <input
          className="rounded-xl border px-3 py-2 text-sm"
          value={form.price}
          onChange={(e) => setForm((s) => ({ ...s, price: e.target.value }))}
          disabled={disabled}
        />
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={item.isEnabled}
            onChange={(e) => onToggle(item.id, e.target.checked)}
            disabled={disabled}
          />
          Включено
        </label>
        <button
          type="button"
          onClick={() => onSave(item.id, form)}
          disabled={disabled}
          className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}
