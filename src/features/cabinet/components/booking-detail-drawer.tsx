"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ReactDOM from "react-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BOOKING_ACTION_WINDOW_MINUTES } from "@/lib/bookings/flow";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import type { BookingItem, BookingReviewState } from "@/features/cabinet/components/client-bookings-panel";
import { FocalImage } from "@/components/ui/focal-image";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { RescheduleSection } from "@/features/cabinet/components/reschedule-section";
import type { ReviewDto } from "@/lib/reviews/types";

type BusyAction = "cancel" | "confirm" | "deleteReview" | null;

interface BookingDetailDrawerProps {
  booking: BookingItem;
  reviewState: BookingReviewState | undefined;
  actionId?: string | null;
  onClose: () => void;
  onCancel: (id: string) => Promise<void>;
  onConfirm: (id: string) => Promise<void>;
  onReviewSubmitted: (review: ReviewDto) => void;
  onDeleteReview: (bookingId: string, reviewId: string) => Promise<void>;
  onActionSuccess: () => void | Promise<void>;
}

function statusLabel(status: BookingItem["status"]) {
  const b = UI_TEXT.clientCabinet.booking;
  if (status === "CHANGE_REQUESTED") return b.changeRequested;
  if (status === "PENDING" || status === "NEW") return b.pending;
  if (status === "CONFIRMED" || status === "PREPAID") return b.confirmed;
  if (status === "IN_PROGRESS" || status === "STARTED") return b.inProgress;
  if (status === "FINISHED") return b.finished;
  return b.cancelled;
}

function getStatusBadgeClasses(status: BookingItem["status"]): string {
  if (status === "PENDING" || status === "NEW") return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  if (status === "CONFIRMED" || status === "PREPAID" || status === "STARTED") {
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
  }
  if (status === "IN_PROGRESS") return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";
  if (status === "FINISHED") return "bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-300";
  if (status === "CANCELLED" || status === "REJECTED" || status === "NO_SHOW") {
    return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  }
  if (status === "CHANGE_REQUESTED") return "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300";
  return "bg-bg-input text-text-sec";
}

function minutesUntilStart(booking: BookingItem): number | null {
  if (!booking.startAtUtc) return null;
  const diffMs = new Date(booking.startAtUtc).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return null;
  return Math.floor(diffMs / 60000);
}

function canRescheduleByClient(booking: BookingItem): boolean {
  if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") return false;
  const minutesLeft = minutesUntilStart(booking);
  return minutesLeft === null || minutesLeft >= BOOKING_ACTION_WINDOW_MINUTES;
}

function canCancelByClient(booking: BookingItem): boolean {
  if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") return false;
  const minutesLeft = minutesUntilStart(booking);
  if (minutesLeft !== null && minutesLeft < BOOKING_ACTION_WINDOW_MINUTES) return false;

  const deadlineHours = booking.provider.cancellationDeadlineHours;
  if (deadlineHours === null || deadlineHours === undefined) return true;
  if (deadlineHours <= 0) return false;
  if (!booking.startAtUtc) return true;
  const startMs = new Date(booking.startAtUtc).getTime();
  if (!Number.isFinite(startMs)) return true;
  const deadlineMs = startMs - deadlineHours * 60 * 60 * 1000;
  return Date.now() <= deadlineMs;
}

function buildRebookUrl(booking: BookingItem): string | null {
  const target = booking.masterProvider ?? booking.provider;
  if (!target.publicUsername) return null;
  const params = new URLSearchParams({ serviceId: booking.service.id });
  return `/u/${target.publicUsername}?${params.toString()}`;
}

function ActionSpinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

function resolveInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : "?";
}

export function BookingDetailDrawer({
  booking,
  reviewState,
  actionId,
  onClose,
  onCancel,
  onConfirm,
  onReviewSubmitted,
  onDeleteReview,
  onActionSuccess,
}: BookingDetailDrawerProps) {
  const t = UI_TEXT.clientCabinet;
  const viewerTimeZone = useViewerTimeZoneContext();
  const [mounted, setMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const canReschedule = useMemo(() => canRescheduleByClient(booking), [booking]);
  const canCancel = useMemo(() => canCancelByClient(booking), [booking]);
  const cancellationDeadlineLabel = useMemo(() => {
    const deadlineHours = booking.provider.cancellationDeadlineHours;
    if (deadlineHours === null || deadlineHours === undefined) return null;
    if (deadlineHours <= 0) return "Отмена запрещена";
    if (!booking.startAtUtc) return null;
    const startMs = new Date(booking.startAtUtc).getTime();
    if (!Number.isFinite(startMs)) return null;
    const deadlineIso = new Date(startMs - deadlineHours * 60 * 60 * 1000).toISOString();
    return `Отмена возможна до ${UI_FMT.dateTimeLong(deadlineIso, { timeZone: viewerTimeZone })}`;
  }, [booking.provider.cancellationDeadlineHours, booking.startAtUtc, viewerTimeZone]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const id = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(id);
  }, [mounted]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Reset inline forms when booking changes
  useEffect(() => {
    setShowReviewForm(false);
    setShowRescheduleForm(false);
  }, [booking.id]);

  const rebookUrl = useMemo(() => buildRebookUrl(booking), [booking]);
  const slotLabel = UI_FMT.dateTimeShort(booking.startAtUtc ?? "", { timeZone: viewerTimeZone });
  const priceLabel = booking.service.price === 0 ? "Уточнить у мастера" : UI_FMT.priceLabel(booking.service.price);
  const durationLabel =
    booking.service.durationMin > 0 ? UI_FMT.durationLabel(booking.service.durationMin) : null;
  const addressLine = [booking.provider.address, booking.provider.district].filter(Boolean).join(" / ");
  const waitsClientDecision =
    booking.status === "CHANGE_REQUESTED" && booking.actionRequiredBy === "CLIENT";
  const canManage = canReschedule || canCancel;
  const isBusy = actionId === booking.id || busyAction !== null;
  const reviewId = reviewState?.reviewId ?? null;
  const reviewSubmitted = !reviewState?.canLeave && reviewId !== null;

  if (!mounted) return null;

  const content = (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative h-full w-full max-w-[420px] overflow-y-auto bg-bg-page shadow-2xl transition-transform duration-300 ${
          isVisible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-full border border-border-subtle bg-bg-input">
              {booking.provider.avatarUrl ? (
                <FocalImage
                  src={booking.provider.avatarUrl}
                  alt=""
                  width={48}
                  height={48}
                  className="rounded-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-text-sec">
                  {resolveInitial(booking.provider.name)}
                </div>
              )}
            </div>
            <div>
              <div className="text-base font-semibold text-text-main">{booking.provider.name}</div>
              {addressLine ? <div className="text-xs text-text-sec">{addressLine}</div> : null}
            </div>
          </div>
          <Button
            variant="icon"
            size="icon"
            onClick={onClose}
            className="h-9 w-9 rounded-full border border-border-subtle bg-bg-input text-lg text-text-sec"
            aria-label="Закрыть"
          >
            ×
          </Button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* Booking details */}
          <section className="space-y-4">
            <div>
              <div className="text-xs text-text-sec">Дата и время</div>
              <div className="text-sm text-text-main">{slotLabel}</div>
            </div>
            <div>
              <div className="text-xs text-text-sec">Услуга</div>
              <div className="text-sm text-text-main">{booking.service.name}</div>
            </div>
            <div className="flex flex-wrap gap-6">
              <div>
                <div className="text-xs text-text-sec">Цена</div>
                <div className="text-sm text-text-main">{priceLabel}</div>
              </div>
              {durationLabel ? (
                <div>
                  <div className="text-xs text-text-sec">Длительность</div>
                  <div className="text-sm text-text-main">{durationLabel}</div>
                </div>
              ) : null}
            </div>
            <div>
              <div className="text-xs text-text-sec">Статус</div>
              <Badge className={getStatusBadgeClasses(booking.status)}>{statusLabel(booking.status)}</Badge>
            </div>
          </section>

          {/* Master (for studio bookings) */}
          {booking.masterProvider ? (
            <section className="rounded-2xl border border-border-subtle bg-bg-input/40 p-4">
              <div className="text-xs text-text-sec">Мастер</div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-10 w-10 overflow-hidden rounded-full border border-border-subtle bg-bg-input">
                  {booking.masterProvider.avatarUrl ? (
                    <FocalImage
                      src={booking.masterProvider.avatarUrl}
                      alt=""
                      width={40}
                      height={40}
                      className="rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-text-sec">
                      {resolveInitial(booking.masterProvider.name)}
                    </div>
                  )}
                </div>
                <div className="text-sm text-text-main">{booking.masterProvider.name}</div>
              </div>
            </section>
          ) : null}

          {booking.comment ? (
            <section className="rounded-2xl border border-border-subtle bg-bg-input/40 p-4 text-sm text-text-sec">
              {booking.comment}
            </section>
          ) : null}

          {cancellationDeadlineLabel ? (
            <section className="rounded-2xl border border-border-subtle bg-bg-input/40 p-4 text-xs text-text-sec">
              {cancellationDeadlineLabel}
            </section>
          ) : null}

          {/* Rebook */}
          {booking.status === "FINISHED" && rebookUrl ? (
            <Button asChild size="lg" className="w-full">
              <Link href={rebookUrl}>Записаться снова</Link>
            </Button>
          ) : null}

          {/* Actions */}
          <section className="space-y-3">
            {canManage && !showRescheduleForm ? (
              <div className="flex flex-wrap gap-2">
                {canReschedule ? (
                  <Button
                    type="button"
                    onClick={() => setShowRescheduleForm(true)}
                    disabled={isBusy}
                    variant="secondary"
                    size="sm"
                  >
                    {t.bookingsPanel.reschedule}
                  </Button>
                ) : null}
                {canCancel ? (
                  <Button
                    type="button"
                    onClick={async () => {
                      setBusyAction("cancel");
                      try {
                        await onCancel(booking.id);
                        await onActionSuccess();
                        onClose();
                      } catch {
                        // errors handled in parent
                      } finally {
                        setBusyAction(null);
                      }
                    }}
                    disabled={isBusy}
                    variant="danger"
                    size="sm"
                  >
                    {busyAction === "cancel" ? <ActionSpinner /> : null}
                    {t.bookingsPanel.cancelBooking}
                  </Button>
                ) : null}
              </div>
            ) : null}

            {waitsClientDecision ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={async () => {
                    setBusyAction("confirm");
                    try {
                      await onConfirm(booking.id);
                      await onActionSuccess();
                      onClose();
                    } catch {
                      // errors handled in parent
                    } finally {
                      setBusyAction(null);
                    }
                  }}
                  disabled={isBusy}
                  variant="secondary"
                  size="sm"
                >
                  {busyAction === "confirm" ? <ActionSpinner /> : null}
                  Подтвердить перенос
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    setBusyAction("cancel");
                    try {
                      await onCancel(booking.id);
                      await onActionSuccess();
                      onClose();
                    } catch {
                      // errors handled in parent
                    } finally {
                      setBusyAction(null);
                    }
                  }}
                  disabled={isBusy}
                  variant="danger"
                  size="sm"
                >
                  {busyAction === "cancel" ? <ActionSpinner /> : null}
                  Отклонить перенос
                </Button>
              </div>
            ) : null}

            {/* Review section */}
            {reviewSubmitted ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {t.bookingsPanel.reviewSubmitted}
              </div>
            ) : reviewState?.canLeave && !showReviewForm ? (
              <Button
                type="button"
                onClick={() => setShowReviewForm(true)}
                variant="secondary"
                size="sm"
                disabled={isBusy}
              >
                {t.bookingsPanel.leaveReview}
              </Button>
            ) : null}

            {showReviewForm ? (
              <ReviewForm
                bookingId={booking.id}
                onCancel={() => setShowReviewForm(false)}
                onSubmitted={(review) => {
                  setShowReviewForm(false);
                  onReviewSubmitted(review);
                }}
              />
            ) : null}

            {reviewState?.canDelete && reviewId && !showReviewForm ? (
              <Button
                type="button"
                onClick={async () => {
                  setBusyAction("deleteReview");
                  try {
                    await onDeleteReview(booking.id, reviewId);
                    await onActionSuccess();
                    onClose();
                  } catch {
                    // errors handled in parent
                  } finally {
                    setBusyAction(null);
                  }
                }}
                disabled={isBusy}
                variant="danger"
                size="sm"
              >
                {busyAction === "deleteReview" ? <ActionSpinner /> : null}
                Удалить отзыв
              </Button>
            ) : null}
          </section>

          {/* Inline reschedule form */}
          {showRescheduleForm ? (
            <RescheduleSection
              booking={{
                id: booking.id,
                providerId: booking.providerId,
                masterProviderId: booking.masterProviderId,
                serviceId: booking.service.id,
                slotLabel: booking.slotLabel,
                status: booking.status,
                silentMode: booking.silentMode,
                startAtUtc: booking.startAtUtc,
                actionRequiredBy: booking.actionRequiredBy,
                clientChangeRequestsCount: booking.clientChangeRequestsCount,
                masterChangeRequestsCount: booking.masterChangeRequestsCount,
              }}
              onCancel={() => setShowRescheduleForm(false)}
              onSuccess={async () => {
                setShowRescheduleForm(false);
                await onActionSuccess();
                onClose();
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
}
