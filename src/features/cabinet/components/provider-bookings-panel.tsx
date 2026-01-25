"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";

type BookingItem = {
  id: string;
  slotLabel: string;
  clientName: string;
  clientPhone: string;
  comment: string | null;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  service: { name: string };
};

type Props = {
  endpoint: string;
  canConfirm?: boolean;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function ProviderBookingsPanel({ endpoint, canConfirm = true }: Props) {
  const [items, setItems] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ bookings: BookingItem[] }>
        | null;

      if (!res.ok) throw new Error(getErrorMessage(json, `API error: ${res.status}`));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to load bookings"));

      setItems(json.data.bookings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = (id: string, status: BookingItem["status"]) => {
    setItems((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
  };

  const confirmBooking = async (id: string) => {
    setActionId(id);
    try {
      const res = await fetch(`/api/bookings/${id}/confirm`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ booking: { id: string; status: BookingItem["status"] } }>
        | null;

      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to confirm"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to confirm"));

      updateStatus(id, json.data.booking.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setActionId(null);
    }
  };

  const cancelBooking = async (id: string) => {
    setActionId(id);
    try {
      const res = await fetch(`/api/bookings/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ booking: { id: string; status: BookingItem["status"] } }>
        | null;

      if (!res.ok) throw new Error(getErrorMessage(json, "Failed to cancel"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Failed to cancel"));

      updateStatus(id, json.data.booking.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border p-5 text-sm text-neutral-600">Загрузка записей…</div>;
  }

  if (error) {
    return (
      <div className="rounded-2xl border p-5 text-sm text-red-600">
        Ошибка загрузки: {error}
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="rounded-2xl border p-5 text-sm text-neutral-600">Записей пока нет.</div>;
  }

  return (
    <div className="space-y-3">
      {items.map((b) => (
        <div key={b.id} className="rounded-2xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-medium">{b.clientName}</div>
            <div className="text-sm text-neutral-600">{b.status}</div>
          </div>
          <div className="mt-1 text-sm text-neutral-700">
            {b.slotLabel} • {b.service.name} • {b.clientPhone}
          </div>
          {b.comment ? <div className="mt-2 text-sm text-neutral-600">{b.comment}</div> : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {canConfirm && b.status === "PENDING" ? (
              <button
                type="button"
                onClick={() => confirmBooking(b.id)}
                disabled={actionId === b.id}
                className="rounded-lg border px-3 py-1 text-sm hover:bg-neutral-50 disabled:opacity-50"
              >
                Подтвердить
              </button>
            ) : null}
            {b.status !== "CANCELLED" ? (
              <button
                type="button"
                onClick={() => cancelBooking(b.id)}
                disabled={actionId === b.id}
                className="rounded-lg border px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Отменить
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
