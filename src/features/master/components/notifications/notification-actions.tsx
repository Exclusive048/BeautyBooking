"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NotificationType } from "@/lib/prisma-enums";
import { Check, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";
import type { NotificationPayload } from "./lib/payload";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import { usePrompt } from "@/hooks/use-prompt";

const TC = UI_TEXT.cabinetMaster.bookings.card;

const T = UI_TEXT.cabinetMaster.notifications.actions;
const ERR = UI_TEXT.cabinetMaster.notifications.errors;

type Props = {
  notificationId: string;
  type: NotificationType | "SCHEDULE_REQUEST";
  /** Already-extracted payload fields — see `readNotificationPayload`. */
  payload: NotificationPayload;
};

/**
 * Per-type action row attached to each `<NotificationCard>`.
 *
 * fix-02 changes:
 * - BOOKING_REQUEST / BOOKING_CREATED: confirm/decline now hide when
 *   `payload.bookingStatus` reflects a terminal state (CONFIRMED /
 *   REJECTED / etc.). The fresh status is merged into the payload
 *   server-side by `mergeBookingPayload` (center.ts), so we get it
 *   without an extra fetch. Removes the race where the master tapped
 *   "Confirm" in the kanban and the notification offered a 2nd
 *   confirm.
 * - "К клиенту" jump-to-card buttons removed across all notification
 *   types. The client-name link in the notification body / the
 *   client list nav are sufficient — 4 redundant chips were UI
 *   clutter.
 */
export function NotificationActions({ notificationId, type, payload }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { prompt, modal: promptModal } = usePrompt();

  const refresh = () => startTransition(() => router.refresh());

  const updateBookingStatus = async (
    action: "confirm" | "decline",
    nextStatus: "CONFIRMED" | "REJECTED",
    comment?: string,
  ) => {
    if (!payload.bookingId || busy) return;
    setBusy(action);
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>(`/api/master/bookings/${payload.bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          ...(comment ? { comment } : {}),
        }),
      });
      // Пометка «прочитано» — фон: отказ ничего не меняет в действии.
      await fetchJsonWithAuth<unknown>(`/api/notifications/${notificationId}/read`, {
        method: "POST",
      }).catch(() => null);
      refresh();
    } catch (caught) {
      // Серверная строка курируемая («Укажите комментарий», «Запись уже
      // изменилась»), и на неё можно отреагировать — показываем её.
      setError(serverMessageOr(caught, action === "confirm" ? ERR.bookingConfirm : ERR.bookingDecline));
    } finally {
      setBusy(null);
    }
  };

  const handleConfirm = () => void updateBookingStatus("confirm", "CONFIRMED");
  // NOTIF-DECLINE-REASON-01: сервер требует причину отказа (она уходит клиенту).
  // Прежний `window.prompt` отправлял отказ и при «Отмене», и с пустой строкой —
  // то есть отменить действие было нельзя, а запрос всегда падал 400.
  const handleDecline = async () => {
    const reason = await prompt({
      title: TC.declineTitle,
      label: TC.declineLabel,
      placeholder: TC.declinePlaceholder,
      confirmLabel: TC.declineConfirmLabel,
      variant: "danger",
    });
    if (!reason) return;
    void updateBookingStatus("decline", "REJECTED", reason);
  };

  if (type === NotificationType.BOOKING_REQUEST || type === NotificationType.BOOKING_CREATED) {
    const status = payload.bookingStatus;
    const isPending = status === null || status === "PENDING" || status === "NEW";
    if (!isPending) {
      return <StatusBadge status={status} />;
    }
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
          onClick={() => void handleDecline()}
          disabled={!payload.bookingId || busy !== null}
        >
          <X className="mr-1 h-3.5 w-3.5" aria-hidden />
          {T.decline}
        </Button>
        {promptModal}
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
        <Button asChild variant="ghost" size="sm" className="rounded-lg">
          <Link href="/cabinet/master/messages">
            <MessageSquare className="mr-1 h-3.5 w-3.5" aria-hidden />
            {T.reply}
          </Link>
        </Button>
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

  // BOOKING_CANCELLED_BY_CLIENT / BOOKING_NO_SHOW: pure-informational
  // after fix-02. The client-name link in the notification body still
  // jumps to the client card when needed.
  return null;
}

function StatusBadge({ status }: { status: string | null }) {
  const label = (() => {
    switch (status) {
      case "CONFIRMED":
      case "PREPAID":
        return T.statusConfirmed;
      case "REJECTED":
        return T.statusRejected;
      case "CANCELLED":
        return T.statusCancelled;
      case "FINISHED":
        return T.statusFinished;
      case "NO_SHOW":
        return T.statusNoShow;
      case "IN_PROGRESS":
      case "STARTED":
        return T.statusInProgress;
      default:
        return T.statusHandled;
    }
  })();
  const tone =
    status === "CONFIRMED" || status === "PREPAID" || status === "FINISHED"
      ? "bg-success-surface text-success-text"
      : "bg-bg-input text-text-sec";
  return (
    <div className="mt-3">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-2xs font-medium ${tone}`}
      >
        {label}
      </span>
    </div>
  );
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
        <p className="text-xs text-danger-text">{error}</p>
      ) : null}
    </div>
  );
}
