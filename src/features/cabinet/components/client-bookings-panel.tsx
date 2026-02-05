"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/lib/types/api";
import { RescheduleModal } from "@/features/cabinet/components/reschedule-modal";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { BOOKING_ACTION_WINDOW_MINUTES } from "@/lib/bookings/flow";
import { UI_TEXT } from "@/lib/ui/text";

type BookingItem = {
  id: string;
  slotLabel: string;
  comment: string | null;
  silentMode: boolean;
  status:
    | "PENDING"
    | "CONFIRMED"
    | "CHANGE_REQUESTED"
    | "REJECTED"
    | "IN_PROGRESS"
    | "FINISHED"
    | "NEW"
    | "PREPAID"
    | "STARTED"
    | "CANCELLED"
    | "NO_SHOW";
  providerId: string;
  masterProviderId: string | null;
  startAtUtc: string | null;
  endAtUtc: string | null;
  proposedStartAtUtc: string | null;
  proposedEndAtUtc: string | null;
  requestedBy: "CLIENT" | "MASTER" | null;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
  changeComment: string | null;
  clientChangeRequestsCount: number;
  masterChangeRequestsCount: number;
  provider: { id: string; name: string; district: string; address: string; type: "MASTER" | "STUDIO" };
  service: { id: string; name: string };
};

type BookingReviewState = {
  canLeave: boolean;
  reviewId: string | null;
  canDelete: boolean;
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  return json && !json.ok ? json.error.message ?? fallback : fallback;
}

function statusLabel(status: BookingItem["status"]) {
  if (status === "CHANGE_REQUESTED") return "Ожидает подтверждения другой стороны";
  if (status === "PENDING") return UI_TEXT.clientCabinet.booking.pending;
  if (status === "CONFIRMED") return UI_TEXT.clientCabinet.booking.confirmed;
  if (status === "IN_PROGRESS" || status === "STARTED") return "В процессе";
  if (status === "FINISHED") return "Завершена";
  return UI_TEXT.clientCabinet.booking.cancelled;
}

function minutesUntilStart(booking: BookingItem): number | null {
  if (!booking.startAtUtc) return null;
  const diffMs = new Date(booking.startAtUtc).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return null;
  return Math.floor(diffMs / 60000);
}

function canManageByClient(booking: BookingItem): boolean {
  if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") return false;
  const minutesLeft = minutesUntilStart(booking);
  return minutesLeft === null || minutesLeft >= BOOKING_ACTION_WINDOW_MINUTES;
}

export function ClientBookingsPanel() {
  const t = UI_TEXT.clientCabinet;
  const [items, setItems] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<BookingItem | null>(null);
  const [reviewBookingId, setReviewBookingId] = useState<string | null>(null);
  const [reviewStateMap, setReviewStateMap] = useState<Record<string, BookingReviewState>>({});

  const loadCanLeave = useCallback(async (bookings: BookingItem[]) => {
    const entries = await Promise.all(
      bookings.map(async (booking) => {
        try {
          const res = await fetch(`/api/reviews/can-leave?bookingId=${encodeURIComponent(booking.id)}`, {
            cache: "no-store",
          });
          const json = (await res.json().catch(() => null)) as
            | ApiResponse<{ canLeave: boolean; reviewId: string | null; canDelete: boolean }>
            | null;
          if (!res.ok || !json || !json.ok) {
            return [
              booking.id,
              { canLeave: false, reviewId: null, canDelete: false },
            ] as const;
          }
          return [
            booking.id,
            {
              canLeave: json.data.canLeave,
              reviewId: json.data.reviewId ?? null,
              canDelete: Boolean(json.data.canDelete),
            },
          ] as const;
        } catch {
          return [
            booking.id,
            { canLeave: false, reviewId: null, canDelete: false },
          ] as const;
        }
      })
    );

    setReviewStateMap(Object.fromEntries(entries));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/bookings", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ bookings: BookingItem[] }> | null;
      if (!res.ok) throw new Error(getErrorMessage(json, `${t.bookingsPanel.apiErrorPrefix} ${res.status}`));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, t.bookingsPanel.failedToLoad));
      setItems(json.data.bookings);
      await loadCanLeave(json.data.bookings);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.bookingsPanel.unknownError);
    } finally {
      setLoading(false);
    }
  }, [loadCanLeave, t.bookingsPanel.apiErrorPrefix, t.bookingsPanel.failedToLoad, t.bookingsPanel.unknownError]);

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
      if (!res.ok) throw new Error(getErrorMessage(json, t.bookingsPanel.failedToCancel));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, t.bookingsPanel.failedToCancel));
      const nextStatus = json.data.booking.status;
      setItems((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                status: nextStatus,
                actionRequiredBy: null,
                requestedBy: null,
                proposedStartAtUtc: null,
                proposedEndAtUtc: null,
              }
            : b
        )
      );
      setReviewStateMap((prev) => ({
        ...prev,
        [id]: { canLeave: false, reviewId: null, canDelete: false },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t.bookingsPanel.unknownError);
    } finally {
      setActionId(null);
    }
  };

  const deleteReviewAction = async (bookingId: string, reviewId: string) => {
    setActionId(bookingId);
    try {
      const res = await fetch(`/api/reviews/${reviewId}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as ApiResponse<{ id: string }> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(getErrorMessage(json, "Failed to delete review"));
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.bookingsPanel.unknownError);
    } finally {
      setActionId(null);
    }
  };

  const confirmBookingAction = async (id: string) => {
    setActionId(id);
    try {
      const res = await fetch(`/api/bookings/${id}/confirm`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as
        | ApiResponse<{ booking: { id: string; status: BookingItem["status"] } }>
        | null;
      if (!res.ok) throw new Error(getErrorMessage(json, "Не удалось подтвердить запись"));
      if (!json || !json.ok) throw new Error(getErrorMessage(json, "Не удалось подтвердить запись"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.bookingsPanel.unknownError);
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.bookingsPanel.loading}</div>;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-600">
        {t.common.error}: {error}
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.bookingsPanel.empty}</div>;
  }

  return (
    <>
      <div className="space-y-3">
        {items.map((b) => {
          const canManage = canManageByClient(b);
          const waitsClientDecision =
            b.status === "CHANGE_REQUESTED" && b.actionRequiredBy === "CLIENT";
          const waitsMasterDecision =
            b.status === "CHANGE_REQUESTED" && b.actionRequiredBy === "MASTER";

          return (
            <div key={b.id} className="lux-card rounded-[22px] p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="font-medium">{b.provider.name}</div>
                <div className="text-sm text-text-sec">{statusLabel(b.status)}</div>
              </div>
              <div className="mt-1 text-sm text-text-main">
                {b.slotLabel} / {b.service.name}
              </div>
              <div className="mt-1 text-sm text-text-sec">
                {b.provider.district} / {b.provider.address}
              </div>
              {b.comment ? <div className="mt-2 text-sm text-text-sec">{b.comment}</div> : null}
              {waitsMasterDecision ? (
                <div className="mt-2 text-xs text-text-sec">Ожидает подтверждения мастера</div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {canManage ? (
                  <>
                    <Button
                      type="button"
                      onClick={() => setRescheduleBooking(b)}
                      disabled={actionId === b.id}
                      variant="secondary"
                      size="sm"
                    >
                      {t.bookingsPanel.reschedule}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => cancelBooking(b.id)}
                      disabled={actionId === b.id}
                      variant="danger"
                      size="sm"
                    >
                      {t.bookingsPanel.cancelBooking}
                    </Button>
                  </>
                ) : null}
                {waitsClientDecision ? (
                  <>
                    <Button
                      type="button"
                      onClick={() => confirmBookingAction(b.id)}
                      disabled={actionId === b.id}
                      variant="secondary"
                      size="sm"
                    >
                      Подтвердить перенос
                    </Button>
                    <Button
                      type="button"
                      onClick={() => cancelBooking(b.id)}
                      disabled={actionId === b.id}
                      variant="danger"
                      size="sm"
                    >
                      Отклонить перенос
                    </Button>
                  </>
                ) : null}
                {reviewStateMap[b.id]?.canLeave ? (
                  <Button
                    type="button"
                    onClick={() => setReviewBookingId(b.id)}
                    variant="secondary"
                    size="sm"
                  >
                    {t.bookingsPanel.leaveReview}
                  </Button>
                ) : null}
                {reviewStateMap[b.id]?.canDelete && reviewStateMap[b.id]?.reviewId ? (
                  <Button
                    type="button"
                    onClick={() => deleteReviewAction(b.id, reviewStateMap[b.id]!.reviewId!)}
                    disabled={actionId === b.id}
                    variant="danger"
                    size="sm"
                  >
                    Delete review
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {rescheduleBooking ? (
        <RescheduleModal
          booking={{
            id: rescheduleBooking.id,
            providerId: rescheduleBooking.providerId,
            masterProviderId: rescheduleBooking.masterProviderId,
            serviceId: rescheduleBooking.service.id,
            slotLabel: rescheduleBooking.slotLabel,
            status: rescheduleBooking.status,
            silentMode: rescheduleBooking.silentMode,
            startAtUtc: rescheduleBooking.startAtUtc,
            actionRequiredBy: rescheduleBooking.actionRequiredBy,
            clientChangeRequestsCount: rescheduleBooking.clientChangeRequestsCount,
            masterChangeRequestsCount: rescheduleBooking.masterChangeRequestsCount,
          }}
          onClose={() => setRescheduleBooking(null)}
          onSuccess={() => {
            void load();
          }}
        />
      ) : null}

      {reviewBookingId ? (
        <div className="mt-4">
          <ReviewForm
            bookingId={reviewBookingId}
            onCancel={() => setReviewBookingId(null)}
            onSubmitted={(review) => {
              setReviewStateMap((prev) => ({
                ...prev,
                [reviewBookingId]: {
                  canLeave: false,
                  reviewId: review.id,
                  canDelete: true,
                },
              }));
              setReviewBookingId(null);
            }}
          />
        </div>
      ) : null}
    </>
  );
}
