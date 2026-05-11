import { MessageSquare, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BookingActionButtons } from "@/features/master/components/dashboard/booking-action-buttons";
import type { DashboardBooking } from "@/lib/master/dashboard.service";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.dashboard.bookings;

const formatRub = (kopeks: number) => UI_FMT.priceLabel(kopeks);

function formatHm(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, "0");
  const m = String(date.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

type Props = {
  booking: DashboardBooking;
};

/**
 * One booking row in the "Ближайшие записи" list. Server-renderable except
 * the confirm/decline buttons which are wrapped into a client island
 * (`<BookingActionButtons>`).
 */
export function BookingRow({ booking }: Props) {
  return (
    <div className="flex gap-4 px-4 py-4">
      <div className="w-12 shrink-0 text-center">
        <p className="font-display text-base text-text-main">
          {formatHm(booking.startAtUtc)}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-sec">
          до {formatHm(booking.endAtUtc)}
        </p>
      </div>

      <div
        aria-hidden
        className={`w-1 shrink-0 rounded-full ${
          booking.isPending
            ? "bg-amber-500"
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
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bg-input text-[10px] font-semibold text-text-sec"
            >
              {initialsOf(booking.clientName)}
            </span>
            <p className="truncate text-sm font-medium text-text-main">
              {booking.clientName}
            </p>
            {booking.isPending ? (
              <Badge variant="warning" className="shrink-0 text-[10px]">
                {T.pendingBadge}
              </Badge>
            ) : null}
          </div>
          <p className="shrink-0 font-display text-sm tabular-nums text-text-main">
            {formatRub(booking.price)}
          </p>
        </div>
        <p className="text-sm text-text-sec">{booking.serviceTitle}</p>
        {booking.changeComment ? (
          <p className="mt-1 line-clamp-1 text-xs text-text-sec">
            {booking.changeComment}
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <button
              type="button"
              aria-label={T.chatAction}
              className="grid h-8 w-8 place-items-center rounded-lg text-text-sec transition-colors hover:bg-bg-input/70 hover:text-text-main"
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={T.moreAction}
              className="grid h-8 w-8 place-items-center rounded-lg text-text-sec transition-colors hover:bg-bg-input/70 hover:text-text-main"
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {booking.isPending ? (
            <BookingActionButtons bookingId={booking.id} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
