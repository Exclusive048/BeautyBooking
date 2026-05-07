"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NotificationType } from "@prisma/client";
import { Check, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import type { NotificationPayload } from "./lib/payload";

const T = UI_TEXT.cabinetMaster.notifications.actions;
const ERR = UI_TEXT.cabinetMaster.notifications.errors;

type Props = {
  notificationId: string;
  type: NotificationType | "SCHEDULE_REQUEST";
  /** Already-extracted payload fields — see `readNotificationPayload`. */
  payload: NotificationPayload;
};

/**
 * Per-type action row attached to each `<NotificationCard>`. Renders a
 * different button set depending on `type`:
 *
 * - `BOOKING_REQUEST` / `BOOKING_CREATED` — Confirm + Decline (calls
 *   `PATCH /api/master/bookings/:id/status`) plus optional "К клиенту".
 * - `REVIEW_LEFT` — Reply link → reviews page focused on this review.
 * - Reminders / chat / reschedule / cancellation — single nav button.
 * - System types — null (no action row).
 *
 * Confirm/decline auto-marks the notification as read on success and
 * `router.refresh()` rebuilds the page from the server so KPI cards,
 * tab counts and the booking list all stay in sync.
 */
export function NotificationActions({ notificationId, type, payload }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const refresh = () => startTransition(() => router.refresh());

  const updateBookingStatus = async (
    action: "confirm" | "decline",
    nextStatus: "CONFIRMED" | "REJECTED",
    comment?: string
  ) => {
    if (!payload.bookingId || busy) return;
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(
        `/api/master/bookings/${payload.bookingId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: nextStatus,
            ...(comment ? { comment } : {}),
          }),
        }
      );
      const json = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!response.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API ${response.status}`);
      }
      await fetch(`/api/notifications/${notificationId}/read`, { method: "POST" }).catch(
        () => null
      );
      refresh();
    } catch {
      setError(action === "confirm" ? ERR.bookingConfirm : ERR.bookingDecline);
    } finally {
      setBusy(null);
    }
  };

  const handleConfirm = () => void updateBookingStatus("confirm", "CONFIRMED");
  const handleDecline = () => {
    const reasonRaw = window.prompt(T.declinePrompt) ?? "";
    const reason = reasonRaw.trim();
    void updateBookingStatus("decline", "REJECTED", reason.length > 0 ? reason : undefined);
  };

  if (type === NotificationType.BOOKING_REQUEST || type === NotificationType.BOOKING_CREATED) {
    return (
      <ActionRow error={error}>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="rounded-lg"
          onClick={handleConfirm}
          disabled={!payload.bookingId || busy !== null}
        >
          <Check className="mr-1 h-3.5 w-3.5" aria-hidden />
          {T.confirm}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="rounded-lg"
          onClick={handleDecline}
          disabled={!payload.bookingId || busy !== null}
        >
          <X className="mr-1 h-3.5 w-3.5" aria-hidden />
          {T.decline}
        </Button>
        {payload.clientUserId ? (
          <Button asChild variant="ghost" size="sm" className="rounded-lg">
            <Link href={`/cabinet/master/clients/${payload.clientUserId}`}>{T.toClient}</Link>
          </Button>
        ) : null}
      </ActionRow>
    );
  }

  if (type === NotificationType.REVIEW_LEFT) {
    return (
      <ActionRow>
        <Button asChild variant="primary" size="sm" className="rounded-lg">
          <Link
            href={
              payload.reviewId
                ? `/cabinet/master/reviews?focus=${payload.reviewId}`
                : "/cabinet/master/reviews"
            }
          >
            <MessageSquare className="mr-1 h-3.5 w-3.5" aria-hidden />
            {T.reply}
          </Link>
        </Button>
        {payload.authorId ? (
          <Button asChild variant="ghost" size="sm" className="rounded-lg">
            <Link href={`/cabinet/master/clients/${payload.authorId}`}>{T.toClient}</Link>
          </Button>
        ) : null}
      </ActionRow>
    );
  }

  if (type === NotificationType.REVIEW_REPLIED) {
    return (
      <ActionRow>
        <Button asChild variant="ghost" size="sm" className="rounded-lg">
          <Link
            href={
              payload.reviewId
                ? `/cabinet/master/reviews?focus=${payload.reviewId}`
                : "/cabinet/master/reviews"
            }
          >
            {T.toReview}
          </Link>
        </Button>
      </ActionRow>
    );
  }

  if (type === NotificationType.CHAT_MESSAGE_RECEIVED) {
    return (
      <ActionRow>
        {payload.bookingId ? (
          <Button asChild variant="ghost" size="sm" className="rounded-lg">
            <Link
              href={`/cabinet/master/dashboard?bookingId=${payload.bookingId}&chat=open`}
            >
              <MessageSquare className="mr-1 h-3.5 w-3.5" aria-hidden />
              {T.reply}
            </Link>
          </Button>
        ) : null}
      </ActionRow>
    );
  }

  if (
    type === NotificationType.BOOKING_REMINDER_24H ||
    type === NotificationType.BOOKING_REMINDER_2H ||
    type === NotificationType.BOOKING_RESCHEDULED ||
    type === NotificationType.BOOKING_RESCHEDULE_REQUESTED ||
    type === NotificationType.BOOKING_COMPLETED_REVIEW
  ) {
    return (
      <ActionRow>
        {payload.bookingId ? (
          <Button asChild variant="ghost" size="sm" className="rounded-lg">
            <Link href={`/cabinet/master/bookings?focus=${payload.bookingId}`}>
              {T.toBooking}
            </Link>
          </Button>
        ) : null}
      </ActionRow>
    );
  }

  if (
    type === NotificationType.BOOKING_CANCELLED_BY_CLIENT ||
    type === NotificationType.BOOKING_NO_SHOW
  ) {
    return (
      <ActionRow>
        {payload.clientUserId ? (
          <Button asChild variant="ghost" size="sm" className="rounded-lg">
            <Link href={`/cabinet/master/clients/${payload.clientUserId}`}>{T.toClient}</Link>
          </Button>
        ) : null}
      </ActionRow>
    );
  }

  return null;
}

function ActionRow({
  children,
  error,
}: {
  children: React.ReactNode;
  error?: string | null;
}) {
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
