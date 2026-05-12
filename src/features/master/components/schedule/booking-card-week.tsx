import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BookingCardActionsMenu } from "@/features/master/components/schedule/booking-card-actions-menu";
import { formatHm } from "@/lib/master/schedule-utils";
import type { ScheduleBookingItem } from "@/lib/master/schedule.service";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.schedule.bookingCard;

const formatRub = (kopeks: number) => UI_FMT.priceLabel(kopeks);

type Props = {
  booking: ScheduleBookingItem;
  topPx: number;
  heightPx: number;
};

/**
 * Calendar-grid booking card. Visual variant follows the brand legend:
 *   - new client    → emerald soft (border + tint, dark text)
 *   - pending       → amber soft (border + tint, amber text)
 *   - confirmed     → solid brand gradient (white text + glow)
 *
 * Compact (height starts at 48px for a 30-min booking) so the menu trigger
 * lives in the corner with `group-hover` reveal — keeps the body legible
 * on long bookings and accessible on short ones.
 */
export function BookingCardWeek({ booking, topPx, heightPx }: Props) {
  const isPending = booking.runtimeStatus === "PENDING" || booking.runtimeStatus === "CHANGE_REQUESTED";
  const isNewClient = booking.isNewClient;
  const compact = heightPx < 64;

  const variant: "confirmed" | "pending" | "new" = isPending
    ? "pending"
    : isNewClient
      ? "new"
      : "confirmed";

  const cardClass =
    variant === "confirmed"
      ? "bg-brand-gradient text-white shadow-[0_4px_14px_-4px_rgba(114,8,8,0.45)]"
      : variant === "pending"
        ? "border border-amber-400/60 bg-amber-100/40 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
        : "border border-emerald-500/60 bg-emerald-100/40 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200";

  return (
    <article
      className={`group absolute overflow-hidden rounded-lg px-2.5 py-1.5 ${cardClass}`}
      style={{
        top: topPx,
        left: 4,
        right: 4,
        height: heightPx - 4,
      }}
    >
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] tabular-nums opacity-90">
        <span>
          {formatHm(booking.startAtUtc)}–{formatHm(booking.endAtUtc)}
        </span>
        {isPending ? (
          <Clock className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
        ) : null}
        {isNewClient && !isPending ? (
          <Badge
            variant="default"
            className="shrink-0 border-emerald-500/40 bg-emerald-500/15 text-[9px] text-emerald-900 dark:text-emerald-100"
          >
            {T.newBadge}
          </Badge>
        ) : null}
      </div>

      <p className="mt-0.5 truncate text-xs font-semibold leading-tight">
        {booking.clientName}
      </p>
      {!compact ? (
        <p className="truncate text-[11px] opacity-80">{booking.serviceTitle}</p>
      ) : null}
      {!compact ? (
        <p className="mt-1 font-display text-xs tabular-nums">
          {formatRub(booking.price)}
        </p>
      ) : null}

      <BookingCardActionsMenu
        bookingId={booking.id}
        rawStatus={booking.rawStatus}
        startAtUtc={booking.startAtUtc.toISOString()}
        durationMin={booking.durationMin}
      />
    </article>
  );
}
