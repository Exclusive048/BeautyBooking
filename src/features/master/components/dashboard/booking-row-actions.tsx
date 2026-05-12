"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MessageSquare, CalendarClock, X } from "lucide-react";
import { useConfirm } from "@/hooks/use-confirm";
import { RescheduleModal } from "@/features/master/components/schedule/reschedule-modal";
import { serializeConversationKey } from "@/lib/chat/conversation-key";
import type { DashboardBooking } from "@/lib/master/dashboard.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.dashboard.bookings;

type Props = {
  providerId: string;
  booking: DashboardBooking;
};

const ICON_BUTTON =
  "grid h-8 w-8 place-items-center rounded-lg text-text-sec transition-colors hover:bg-bg-input/70 hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-glow/45";

const TERMINAL_STATUSES = new Set([
  "FINISHED",
  "CANCELLED",
  "REJECTED",
  "NO_SHOW",
] as const);

/**
 * 3 icon actions for the dashboard «Ближайшие записи» rows:
 *
 *   • Chat       — deep-link to /cabinet/master/messages?key=...
 *   • Reschedule — opens the shared `<RescheduleModal>` from schedule
 *   • Cancel     — confirm dialog → PATCH master booking status
 *
 * Cancel + reschedule are hidden for terminal statuses (FINISHED /
 * CANCELLED / REJECTED / NO_SHOW). Chat stays visible because the
 * thread history remains accessible after a booking ends.
 *
 * Chat is also hidden when the booking is a guest one (no
 * `clientUserId`) since the conversation key requires both ids.
 */
export function BookingRowActions({ providerId, booking }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { confirm, modal } = useConfirm();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTerminal = TERMINAL_STATUSES.has(
    booking.status as (typeof TERMINAL_STATUSES extends Set<infer V> ? V : never),
  );
  const chatHref = booking.clientUserId
    ? `/cabinet/master/messages?key=${encodeURIComponent(
        serializeConversationKey({
          providerId,
          clientUserId: booking.clientUserId,
        }),
      )}`
    : null;

  async function handleCancel() {
    const ok = await confirm({
      title: T.cancelConfirmTitle,
      message: T.cancelConfirmMessage,
      confirmLabel: T.cancelConfirmCta,
      variant: "danger",
    });
    if (!ok) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/master/bookings/${encodeURIComponent(booking.id)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CANCELLED" }),
        },
      );
      if (!res.ok) throw new Error(T.cancelFailed);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : T.cancelFailed);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <div className="flex gap-1">
        {chatHref ? (
          <Link
            href={chatHref}
            aria-label={T.chatAction}
            title={T.chatAction}
            className={ICON_BUTTON}
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}

        {!isTerminal ? (
          <button
            type="button"
            aria-label={T.rescheduleAction}
            title={T.rescheduleAction}
            className={ICON_BUTTON}
            onClick={() => setRescheduleOpen(true)}
          >
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}

        {!isTerminal ? (
          <button
            type="button"
            aria-label={T.cancelAction}
            title={T.cancelAction}
            className={ICON_BUTTON}
            onClick={() => void handleCancel()}
            disabled={cancelling}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-1 text-[11px] text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {rescheduleOpen ? (
        <RescheduleModal
          open
          bookingId={booking.id}
          startAtUtc={booking.startAtUtc.toISOString()}
          durationMin={booking.durationMin}
          onClose={() => setRescheduleOpen(false)}
        />
      ) : null}

      {modal}
    </>
  );
}
