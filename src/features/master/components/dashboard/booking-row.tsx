import { Badge } from "@/components/ui/badge";
import { BookingActionButtons } from "@/features/master/components/dashboard/booking-action-buttons";
import { BookingRowActions } from "@/features/master/components/dashboard/booking-row-actions";
import { WorkContextBadge } from "@/features/master/components/work-context-badge";
import { isBookingPastConfirmWindow } from "@/lib/bookings/action-state";
import type { DashboardBooking } from "@/lib/master/dashboard.service";
import { formatLocalHm } from "@/lib/schedule/timezone";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.dashboard.bookings;

const formatRub = (kopeks: number) => UI_FMT.priceLabel(kopeks);

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

type Props = {
  booking: DashboardBooking;
  /** Salon (master) tz — EXP-017: booking times shown in salon-tz, matching the kanban. */
  timezone: string;
  /** STUDIO-MASTER-PROFILES (этап 3): пометка «Личная / Студия» рядом с услугой. */
  showWorkContext?: boolean;
};

/**
 * One booking row in the "Ближайшие записи" list. Server-renderable except
 * the action buttons (chat / reschedule / cancel) and the
 * confirm/decline pending buttons, both wrapped into client islands.
 *
 * chat-url-fix: the chat deep-link is now driven by `booking.chatSlug`
 * (server-resolved in `dashboard.service.ts`). The row no longer
 * needs the master's own provider id.
 */
export function BookingRow({ booking, timezone, showWorkContext = false }: Props) {
  return (
    <div data-focus-id={booking.id} data-testid="booking-row" className="flex gap-4 px-4 py-4">
      <div className="w-12 shrink-0 text-center">
        <p className="font-display text-base text-text-main">
          {formatLocalHm(booking.startAtUtc, timezone)}
        </p>
        <p className="font-mono text-3xs uppercase tracking-[0.1em] text-text-sec">
          до {formatLocalHm(booking.endAtUtc, timezone)}
        </p>
      </div>

      <div
        aria-hidden
        className={`w-1 shrink-0 rounded-full ${
          booking.isPending
            ? "bg-warning"
            : booking.isCurrent
              ? "bg-brand-gradient"
              : "bg-primary/40"
        }`}
      />

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bg-input text-3xs font-semibold text-text-sec"
            >
              {initialsOf(booking.clientName)}
            </span>
            <p className="truncate text-sm font-medium text-text-main">
              {booking.clientName}
            </p>
            {booking.isPending ? (
              <Badge variant="warning" className="shrink-0">
                {T.pendingBadge}
              </Badge>
            ) : null}
          </div>
          <p className="shrink-0 font-display text-sm tabular-nums text-text-main">
            {formatRub(booking.price)}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm text-text-sec">{booking.serviceTitle}</p>
          {showWorkContext ? <WorkContextBadge context={booking.workContext} /> : null}
        </div>
        {booking.changeComment ? (
          <p className="mt-1 line-clamp-1 text-xs text-text-sec">
            {booking.changeComment}
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2">
          <BookingRowActions booking={booking} />
          {/* MASTER-BOOKING-UI-FIX-A #2а: confirm/decline visible only when
              the master is the actionable side. For PENDING that's always
              true (no change-request in flight). For CHANGE_REQUESTED the
              master needs `actionRequiredBy === "MASTER"` — otherwise
              we're the initiator and must wait for the client's reply.
              MASTER-DASHBOARD-FIX-A #3: when the booking's start time has
              already passed the buttons remain visible but disabled with
              a tooltip — confirming after start is no longer meaningful
              (the booking should have happened by now). */}
          {booking.isPending &&
          (booking.status === "PENDING" ||
            (booking.status === "CHANGE_REQUESTED" &&
              booking.actionRequiredBy === "MASTER")) ? (
            <BookingActionButtons
              bookingId={booking.id}
              isPastConfirmWindow={isBookingPastConfirmWindow(booking.startAtUtc)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
