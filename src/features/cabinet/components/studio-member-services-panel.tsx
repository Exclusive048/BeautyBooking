"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

type ServiceItem = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  catalogEnabled: boolean;
  enabled: boolean;
};

type Props = {
  studioId: string;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function StudioMemberServicesPanel({ studioId }: Props) {
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const endpoint = useMemo(() => `/api/studios/${studioId}/me/services`, [studioId]);

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

  const toggleService = async (id: string, enabled: boolean) => {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toggles: [{ serviceId: id, enabled }] }),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ updated: number }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to update"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to update"));
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, enabled } : item))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border p-5 text-sm text-neutral-600">Загрузка услуг...</div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border p-4 text-sm text-red-600">Ошибка: {error}</div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-2xl border p-4 text-sm text-neutral-600">Нет услуг студии.</div>
      ) : (
        <div className="space-y-3">
          {items.map((service) => {
            const disabled = savingId === service.id || !service.catalogEnabled;
            return (
              <div key={service.id} className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{service.name}</div>
                    <div className="text-sm text-neutral-600">
                      {service.durationMin} мин · {service.price} ₽
                    </div>
                    {!service.catalogEnabled ? (
                      <div className="mt-1 text-xs text-neutral-500">
                        Услуга выключена в каталоге.
                      </div>
                    ) : null}
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={service.catalogEnabled ? service.enabled : false}
                      onChange={(e) => toggleService(service.id, e.target.checked)}
                      disabled={disabled}
                    />
                    Включено у меня
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
