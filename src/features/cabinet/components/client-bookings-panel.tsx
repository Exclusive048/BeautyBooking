"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import { RescheduleModal } from "@/features/cabinet/components/reschedule-modal";

type BookingItem = {
  id: string;
  slotLabel: string;
  comment: string | null;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  providerId: string;
  masterProviderId: string | null;
  provider: { id: string; name: string; district: string; address: string; type: "MASTER" | "STUDIO" };
  service: { id: string; name: string };
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

export function ClientBookingsPanel() {
  const [items, setItems] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<BookingItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/bookings", { cache: "no-store" });
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      setItems((prev) => prev.map((b) => (b.id === id ? { ...b, status: "CANCELLED" } : b)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border p-5 text-sm text-neutral-600">Загружаем записи</div>;
  }

  if (error) {
    return (
      <div className="rounded-2xl border p-5 text-sm text-red-600">Ошибка: {error}</div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border p-5 text-sm text-neutral-600">Записей пока нет.</div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {items.map((b) => (
          <div key={b.id} className="rounded-2xl border p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="font-medium">{b.provider.name}</div>
              <div className="text-sm text-neutral-600">{b.status}</div>
            </div>
            <div className="mt-1 text-sm text-neutral-700">
              {b.slotLabel} · {b.service.name}
            </div>
            <div className="mt-1 text-sm text-neutral-600">
              {b.provider.district} · {b.provider.address}
            </div>
            {b.comment ? <div className="mt-2 text-sm text-neutral-600">{b.comment}</div> : null}
            {b.status !== "CANCELLED" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRescheduleBooking(b)}
                  disabled={actionId === b.id}
                  className="rounded-lg border px-3 py-1 text-sm hover:bg-neutral-50 disabled:opacity-50"
                >
                  Перенести
                </button>
                <button
                  type="button"
                  onClick={() => cancelBooking(b.id)}
                  disabled={actionId === b.id}
                  className="rounded-lg border px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Отменить запись
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {rescheduleBooking ? (
        <RescheduleModal
          booking={{
            id: rescheduleBooking.id,
            providerId: rescheduleBooking.providerId,
            masterProviderId: rescheduleBooking.masterProviderId,
            serviceId: rescheduleBooking.service.id,
            slotLabel: rescheduleBooking.slotLabel,
          }}
          onClose={() => setRescheduleBooking(null)}
          onSuccess={(next) => {
            setItems((prev) =>
              prev.map((item) =>
                item.id === rescheduleBooking.id
                  ? { ...item, slotLabel: next.slotLabel }
                  : item
              )
            );
          }}
        />
      ) : null}
    </>
  );
}
