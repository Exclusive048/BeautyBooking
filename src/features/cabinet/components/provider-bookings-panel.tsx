"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import { RescheduleModal } from "@/features/cabinet/components/reschedule-modal";
import { UI_TEXTS } from "@/lib/ui-texts/ru";

type BookingItem = {
  id: string;
  slotLabel: string;
  clientName: string;
  clientPhone: string;
  comment: string | null;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  providerId: string;
  masterProviderId: string | null;
  service: { id: string; name: string };
};

type Props = {
  endpoint: string;
  canConfirm?: boolean;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

function statusLabel(status: BookingItem["status"]) {
  if (status === "PENDING") return UI_TEXTS.booking.pending;
  if (status === "CONFIRMED") return UI_TEXTS.booking.confirmed;
  return UI_TEXTS.booking.cancelled;
}

export function ProviderBookingsPanel({ endpoint, canConfirm = true }: Props) {
  const [items, setItems] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<BookingItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ bookings: BookingItem[] }> | null;

      if (!res.ok) throw new Error(getErrorMessage(json, `${UI_TEXTS.bookingsPanel.apiErrorPrefix} ${res.status}`));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, UI_TEXTS.bookingsPanel.failedToLoad));

      setItems(json.data.bookings);
    } catch (e) {
      setError(e instanceof Error ? e.message : UI_TEXTS.bookingsPanel.unknownError);
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

      if (!res.ok) throw new Error(getErrorMessage(json, UI_TEXTS.bookingsPanel.failedToConfirm));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, UI_TEXTS.bookingsPanel.failedToConfirm));

      updateStatus(id, json.data.booking.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : UI_TEXTS.bookingsPanel.unknownError);
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

      if (!res.ok) throw new Error(getErrorMessage(json, UI_TEXTS.bookingsPanel.failedToCancel));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, UI_TEXTS.bookingsPanel.failedToCancel));

      updateStatus(id, json.data.booking.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : UI_TEXTS.bookingsPanel.unknownError);
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border p-5 text-sm text-neutral-600">{UI_TEXTS.bookingsPanel.loading}</div>;
  }

  if (error) {
    return (
      <div className="rounded-2xl border p-5 text-sm text-red-600">
        {UI_TEXTS.bookingsPanel.loadErrorPrefix} {error}
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="rounded-2xl border p-5 text-sm text-neutral-600">{UI_TEXTS.bookingsPanel.empty}</div>;
  }

  return (
    <>
      <div className="space-y-3">
        {items.map((b) => (
          <div key={b.id} className="rounded-2xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="font-medium">{b.clientName}</div>
              <div className="text-sm text-neutral-600">{statusLabel(b.status)}</div>
            </div>
            <div className="mt-1 text-sm text-neutral-700">
              {b.slotLabel} · {b.service.name} · {b.clientPhone}
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
                  {UI_TEXTS.bookingsPanel.confirm}
                </button>
              ) : null}
              {b.status !== "CANCELLED" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setRescheduleBooking(b)}
                    disabled={actionId === b.id}
                    className="rounded-lg border px-3 py-1 text-sm hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {UI_TEXTS.bookingsPanel.reschedule}
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelBooking(b.id)}
                    disabled={actionId === b.id}
                    className="rounded-lg border px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {UI_TEXTS.bookingsPanel.cancelShort}
                  </button>
                </>
              ) : null}
            </div>
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
                item.id === rescheduleBooking.id ? { ...item, slotLabel: next.slotLabel } : item
              )
            );
          }}
        />
      ) : null}
    </>
  );
}
