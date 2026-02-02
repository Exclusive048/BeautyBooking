"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiResponse } from "@/lib/types/api";
import { RescheduleModal } from "@/features/cabinet/components/reschedule-modal";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { UI_TEXTS } from "@/lib/ui-texts/ru";

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

function statusLabel(status: BookingItem["status"]) {
  if (status === "PENDING") return UI_TEXTS.booking.pending;
  if (status === "CONFIRMED") return UI_TEXTS.booking.confirmed;
  return UI_TEXTS.booking.cancelled;
}

export function ClientBookingsPanel() {
  const [items, setItems] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<BookingItem | null>(null);
  const [reviewBookingId, setReviewBookingId] = useState<string | null>(null);
  const [canLeaveMap, setCanLeaveMap] = useState<Record<string, boolean>>({});

  const loadCanLeave = useCallback(async (bookings: BookingItem[]) => {
    const entries = await Promise.all(
      bookings.map(async (booking) => {
        try {
          const res = await fetch(`/api/reviews/can-leave?bookingId=${encodeURIComponent(booking.id)}`, {
            cache: "no-store",
          });
          const json = (await res.json().catch(() => null)) as ApiResponse<{ canLeave: boolean }> | null;
          if (!res.ok || !json || !json.ok) return [booking.id, false] as const;
          return [booking.id, json.data.canLeave] as const;
        } catch {
          return [booking.id, false] as const;
        }
      })
    );

    setCanLeaveMap(Object.fromEntries(entries));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/bookings", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ bookings: BookingItem[] }> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, `${UI_TEXTS.bookingsPanel.apiErrorPrefix} ${res.status}`));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, UI_TEXTS.bookingsPanel.failedToLoad));
      setItems(json.data.bookings);
      await loadCanLeave(json.data.bookings);
    } catch (e) {
      setError(e instanceof Error ? e.message : UI_TEXTS.bookingsPanel.unknownError);
    } finally {
      setLoading(false);
    }
  }, [loadCanLeave]);

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
      if (!res.ok) throw new Error(getErrorMessage(json, UI_TEXTS.bookingsPanel.failedToCancel));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, UI_TEXTS.bookingsPanel.failedToCancel));
      setItems((prev) => prev.map((b) => (b.id === id ? { ...b, status: "CANCELLED" } : b)));
      setCanLeaveMap((prev) => ({ ...prev, [id]: false }));
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
        {UI_TEXTS.common.error}: {error}
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
            <div className="flex items-center justify-between gap-4">
              <div className="font-medium">{b.provider.name}</div>
              <div className="text-sm text-neutral-600">{statusLabel(b.status)}</div>
            </div>
            <div className="mt-1 text-sm text-neutral-700">
              {b.slotLabel} ? {b.service.name}
            </div>
            <div className="mt-1 text-sm text-neutral-600">
              {b.provider.district} ? {b.provider.address}
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
                  {UI_TEXTS.bookingsPanel.reschedule}
                </button>
                <button
                  type="button"
                  onClick={() => cancelBooking(b.id)}
                  disabled={actionId === b.id}
                  className="rounded-lg border px-3 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {UI_TEXTS.bookingsPanel.cancelBooking}
                </button>
                {canLeaveMap[b.id] ? (
                  <button
                    type="button"
                    onClick={() => setReviewBookingId(b.id)}
                    className="rounded-lg border px-3 py-1 text-sm hover:bg-neutral-50"
                  >
                    Leave review
                  </button>
                ) : null}
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
                item.id === rescheduleBooking.id ? { ...item, slotLabel: next.slotLabel } : item
              )
            );
          }}
        />
      ) : null}

      {reviewBookingId ? (
        <div className="mt-4">
          <ReviewForm
            bookingId={reviewBookingId}
            onCancel={() => setReviewBookingId(null)}
            onSubmitted={() => {
              setCanLeaveMap((prev) => ({ ...prev, [reviewBookingId]: false }));
              setReviewBookingId(null);
            }}
          />
        </div>
      ) : null}
    </>
  );
}
