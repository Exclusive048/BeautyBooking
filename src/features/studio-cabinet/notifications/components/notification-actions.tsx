"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarClock, Check, MessageSquare, Star, User, X } from "lucide-react";
import { NotificationType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/lib/ui/text";
import { readNotificationPayload } from "@/features/master/components/notifications/lib/payload";

const T = UI_TEXT.studioCabinet.notificationsV2.actions;
const E = UI_TEXT.studioCabinet.notificationsV2.errors;

type Props = {
  notificationId: string;
  type: NotificationType | "SCHEDULE_REQUEST";
  payloadJson: unknown;
  /** Optional pre-resolved deep link from `getNotificationCenterData`
   *  (e.g. `/cabinet/studio/schedule-requests` for SCHEDULE_REQUEST). */
  openHref?: string;
};

/**
 * STUDIO-NOTIFICATIONS-A action row per notification card.
 *
 * Mirror of master's `notification-actions.tsx` pattern: inline action
 * buttons for the one type that's actionable from the studio surface
 * (SCHEDULE_REQUEST), navigation chips for everything else. Master uses
 * inline for BOOKING_REQUEST because the action is binary (confirm /
 * decline); studio's SCHEDULE_REQUEST is binary too (approve / reject)
 * so inline is the right mirror — both also expose a richer "open" link
 * to a dedicated page for context.
 */
export function NotificationActions({ notificationId, type, payloadJson, openHref }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | "rsAccept" | "rsDecline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  const payload = readNotificationPayload(payloadJson);

  // FIX-R2-06-A: studio admins reach parity with the solo master — accept /
  // decline a client-proposed reschedule inline (two-sided approval). Accept
  // reuses the shared atomic `confirmBooking` path (re-validated, FIX-R2-01-B);
  // decline reverts to the original time. Both endpoints admit a studio admin
  // via `requireBookingConfirmAccess` (→ actor "MASTER").
  const callBookingRescheduleDecision = async (decision: "rsAccept" | "rsDecline") => {
    if (!payload.bookingId || busy) return;
    setBusy(decision);
    setError(null);
    try {
      const url =
        decision === "rsAccept"
          ? `/api/bookings/${encodeURIComponent(payload.bookingId)}/confirm`
          : `/api/bookings/${encodeURIComponent(payload.bookingId)}/decline-reschedule`;
      const response = await fetch(url, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? E.bookingReschedule);
        return;
      }
      refresh();
    } catch {
      setError(E.bookingReschedule);
    } finally {
      setBusy(null);
    }
  };

  // SCHEDULE_REQUEST pseudo-id format is `schedule-request:<realId>` —
  // see `getNotificationCenterData` in `src/lib/notifications/center.ts`.
  const realScheduleRequestId =
    type === "SCHEDULE_REQUEST" && notificationId.startsWith("schedule-request:")
      ? notificationId.slice("schedule-request:".length)
      : null;

  const callScheduleRequestAction = async (action: "approve" | "reject", comment?: string) => {
    if (!realScheduleRequestId || busy) return;
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(
        `/api/studio/schedule/requests/${encodeURIComponent(realScheduleRequestId)}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: comment ? JSON.stringify({ comment }) : undefined,
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? E.scheduleRequest);
        return;
      }
      refresh();
    } catch {
      setError(E.scheduleRequest);
    } finally {
      setBusy(null);
    }
  };

  if (type === "SCHEDULE_REQUEST" && realScheduleRequestId) {
    return (
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={busy !== null}
            onClick={() => void callScheduleRequestAction("approve")}
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            {T.approve}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() => {
              const raw = window.prompt(T.rejectPrompt) ?? "";
              const trimmed = raw.trim();
              if (!trimmed) return;
              void callScheduleRequestAction("reject", trimmed);
            }}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            {T.reject}
          </Button>
          {openHref ? (
            <Link
              href={openHref}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline"
            >
              {T.openRequest}
            </Link>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  // FIX-R2-06-A: inline accept/decline for a client-proposed reschedule.
  // Hide once resolved (merged payload no longer CHANGE_REQUESTED).
  if (
    type === NotificationType.BOOKING_RESCHEDULE_REQUESTED &&
    payload.bookingId &&
    (!payload.bookingStatus || payload.bookingStatus === "CHANGE_REQUESTED")
  ) {
    return (
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={busy !== null}
            onClick={() => void callBookingRescheduleDecision("rsAccept")}
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            {T.acceptReschedule}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() => void callBookingRescheduleDecision("rsDecline")}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            {T.declineReschedule}
          </Button>
          <Link
            href={openHref ?? "/cabinet/studio/bookings"}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline"
          >
            {T.openBooking}
          </Link>
        </div>
        {error ? (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  // Navigation pattern (mirror master notif for non-actionable types).
  // Compute deep links from the merged payload.
  const navLinks: Array<{ label: string; href: string; icon: typeof CalendarClock }> = [];

  if (
    type === NotificationType.REVIEW_LEFT ||
    type === NotificationType.REVIEW_REPLIED ||
    type === NotificationType.REVIEW_DELETED_BY_ADMIN
  ) {
    navLinks.push({ label: T.openReview, href: "/cabinet/studio/reviews", icon: Star });
  }

  if (payload.bookingId) {
    navLinks.push({
      label: T.openBooking,
      href: "/cabinet/studio/bookings",
      icon: CalendarClock,
    });
  }

  if (type === NotificationType.CHAT_MESSAGE_RECEIVED && payload.bookingId) {
    navLinks.push({
      label: T.openChat,
      href: openHref ?? "/cabinet/studio/bookings",
      icon: MessageSquare,
    });
  }

  if (payload.clientUserId) {
    navLinks.push({ label: T.openClient, href: "/cabinet/studio/clients", icon: User });
  }

  if (openHref && !navLinks.some((link) => link.href === openHref)) {
    navLinks.push({ label: T.open, href: openHref, icon: CalendarClock });
  }

  if (navLinks.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {navLinks.map((link) => {
        const Icon = link.icon;
        return (
          <Link
            key={link.href + link.label}
            href={link.href}
            className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-bg-card px-2.5 py-1 text-[11px] font-medium text-text-sec transition-colors hover:text-text-main"
          >
            <Icon className="h-3 w-3" aria-hidden />
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
