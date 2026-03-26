"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ApiResponse } from "@/lib/types/api";
import { RescheduleModal } from "@/features/cabinet/components/reschedule-modal";
import { BookingDetailDrawer } from "@/features/cabinet/components/booking-detail-drawer";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { providerPublicUrl } from "@/lib/public-urls";
import { BookingChat } from "@/features/chat/components/booking-chat";

export type BookingItem = {
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
  provider: {
    id: string;
    name: string;
    district: string;
    address: string;
    type: "MASTER" | "STUDIO";
    publicUsername: string | null;
    avatarUrl: string | null;
    avatarFocalX: number | null;
    avatarFocalY: number | null;
    cancellationDeadlineHours: number | null;
  };
  masterProvider: {
    id: string;
    name: string;
    district: string;
    address: string;
    type: "MASTER" | "STUDIO";
    publicUsername: string | null;
    avatarUrl: string | null;
    avatarFocalX: number | null;
    avatarFocalY: number | null;
    cancellationDeadlineHours: number | null;
  } | null;
  service: { id: string; name: string; price: number; durationMin: number };
};

export type BookingReviewState = {
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

function isExcludedStatus(status: BookingItem["status"]): boolean {
  return status === "REJECTED" || status === "NO_SHOW";
}

function sortBookings(items: BookingItem[]): BookingItem[] {
  const now = Date.now();
  return [...items].sort((a, b) => {
    const aTs = a.startAtUtc ? new Date(a.startAtUtc).getTime() : null;
    const bTs = b.startAtUtc ? new Date(b.startAtUtc).getTime() : null;
    const aPast = aTs !== null && aTs < now;
    const bPast = bTs !== null && bTs < now;

    if (aPast !== bPast) return aPast ? 1 : -1;
    if (aTs === null || bTs === null) return 0;
    if (!aPast) return aTs - bTs;
    return bTs - aTs;
  });
}

export function ClientBookingsPanel() {
  const t = UI_TEXT.clientCabinet;
  const viewerTimeZone = useViewerTimeZoneContext();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<BookingItem | null>(null);
  const [reviewBookingId, setReviewBookingId] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingItem | null>(null);
  const [reviewStateMap, setReviewStateMap] = useState<Record<string, BookingReviewState>>({});
  const [chatOpenMap, setChatOpenMap] = useState<Record<string, boolean>>({});
  const [chatUnreadMap, setChatUnreadMap] = useState<Record<string, number>>({});
  const chatQueryHandledRef = useRef(false);
  const chatScrollHandledRef = useRef(false);

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
      const prepared = sortBookings(json.data.bookings.filter((item) => !isExcludedStatus(item.status)));
      setItems(prepared);
      await loadCanLeave(prepared);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.bookingsPanel.unknownError);
    } finally {
      setLoading(false);
    }
  }, [loadCanLeave, t.bookingsPanel.apiErrorPrefix, t.bookingsPanel.failedToLoad, t.bookingsPanel.unknownError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (chatQueryHandledRef.current) return;
    const bookingId = searchParams.get("bookingId");
    const chat = searchParams.get("chat");
    if (chat !== "open" || !bookingId) return;
    chatQueryHandledRef.current = true;
    setChatOpenMap((prev) => ({ ...prev, [bookingId]: true }));
  }, [searchParams]);

  useEffect(() => {
    const bookingId = searchParams.get("bookingId");
    const chat = searchParams.get("chat");
    if (chat !== "open" || !bookingId) return;
    if (chatScrollHandledRef.current) return;
    const target = document.getElementById(`booking-${bookingId}`);
    if (!target) return;
    chatScrollHandledRef.current = true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [items.length, searchParams]);

  const sortedItems = useMemo(() => sortBookings(items), [items]);

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
      throw e;
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
        throw new Error(getErrorMessage(json, "Не удалось удалить отзыв"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t.bookingsPanel.unknownError);
      throw e;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : t.bookingsPanel.unknownError);
      throw e;
    } finally {
      setActionId(null);
    }
  };

  const toggleChat = (id: string) => {
    setChatOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleUnreadChange = (id: string, count: number) => {
    setChatUnreadMap((prev) => (prev[id] === count ? prev : { ...prev, [id]: count }));
  };

  if (loading) {
    return <div className="lux-card rounded-[24px] p-5 text-sm text-text-sec">{t.bookingsPanel.loading}</div>;
  }

  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-600 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">
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
        {sortedItems.map((b) => {
          const waitsMasterDecision =
            b.status === "CHANGE_REQUESTED" && b.actionRequiredBy === "MASTER";
          const studioName = b.provider.type === "STUDIO" ? b.provider.name : null;
          const masterName =
            b.masterProvider?.name ?? (b.provider.type === "MASTER" ? b.provider.name : null);
          const masterTarget =
            b.masterProvider ?? (b.provider.type === "MASTER" ? b.provider : null);
          const masterLink = masterTarget
            ? providerPublicUrl(
                { id: masterTarget.id, publicUsername: masterTarget.publicUsername },
                "client-bookings-master"
              )
            : null;
          const studioLink =
            b.provider.type === "STUDIO"
              ? providerPublicUrl(
                  { id: b.provider.id, publicUsername: b.provider.publicUsername },
                  "client-bookings-studio"
                )
              : null;
          const addressLine = [b.provider.district, b.provider.address].filter(Boolean).join(" / ");
          const slotLabel = UI_FMT.dateTimeShort(b.startAtUtc ?? "", { timeZone: viewerTimeZone });

          return (
            <div
              key={b.id}
              id={`booking-${b.id}`}
              onClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("[data-ignore-drawer]")) return;
                setSelectedBooking(b);
              }}
              className="lux-card rounded-[22px] p-4 cursor-pointer transition-all hover:ring-1 hover:ring-border-subtle"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="font-medium">{b.provider.name}</div>
                <div className="text-sm text-text-sec">{statusLabel(b.status)}</div>
              </div>
              <div className="mt-1 text-sm text-text-main">
                {slotLabel} / {b.service.name}
              </div>
              {masterName ? <div className="mt-1 text-sm text-text-sec">Мастер: {masterName}</div> : null}
              {studioName ? <div className="mt-1 text-sm text-text-sec">Студия: {studioName}</div> : null}
              {addressLine ? <div className="mt-1 text-sm text-text-sec">{addressLine}</div> : null}
              {b.comment ? <div className="mt-2 text-sm text-text-sec">{b.comment}</div> : null}
              {waitsMasterDecision ? (
                <div className="mt-2 text-xs text-text-sec">Ожидает подтверждения мастера</div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2" data-ignore-drawer>
                {masterLink ? (
                  <Button asChild type="button" variant="secondary" size="sm">
                    <Link href={masterLink} onClick={(event) => event.stopPropagation()}>
                      Перейти к мастеру
                    </Link>
                  </Button>
                ) : null}
                {studioLink ? (
                  <Button asChild type="button" variant="secondary" size="sm">
                    <Link href={studioLink} onClick={(event) => event.stopPropagation()}>
                      Перейти в студию
                    </Link>
                  </Button>
                ) : null}
              </div>
              <div className="mt-4 rounded-2xl border border-border-subtle bg-bg-input/40 p-3" data-ignore-drawer>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleChat(b.id);
                  }}
                  className="flex w-full items-center justify-between text-sm font-medium"
                >
                  <span>Чат</span>
                  {chatUnreadMap[b.id] ? (
                    <Badge className="px-2 py-0.5 text-[11px]">{chatUnreadMap[b.id]}</Badge>
                  ) : null}
                </button>
                {chatOpenMap[b.id] ? (
                  <div className="mt-3">
                    <BookingChat
                      bookingId={b.id}
                      currentRole="CLIENT"
                      onUnreadCountChange={(count) => handleUnreadChange(b.id, count)}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {selectedBooking ? (
        <BookingDetailDrawer
          booking={selectedBooking}
          reviewState={reviewStateMap[selectedBooking.id]}
          actionId={actionId}
          onClose={() => setSelectedBooking(null)}
          onCancel={cancelBooking}
          onConfirm={confirmBookingAction}
          onReschedule={setRescheduleBooking}
          onLeaveReview={setReviewBookingId}
          onDeleteReview={deleteReviewAction}
          onActionSuccess={load}
        />
      ) : null}

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
