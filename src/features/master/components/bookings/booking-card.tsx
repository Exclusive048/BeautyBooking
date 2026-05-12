import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FocalImage } from "@/components/ui/focal-image";
import { BookingCardActions } from "@/features/master/components/bookings/booking-card-actions";
import { BookingManageActions } from "@/features/master/components/bookings/booking-manage-actions";
import type { ColumnId, KanbanBookingItem } from "@/lib/master/bookings.service";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.bookings.card;

const formatRub = (kopeks: number) => UI_FMT.priceLabel(kopeks);

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase() || "•";
}

type Props = {
  booking: KanbanBookingItem;
  column: ColumnId;
};

/**
 * One booking card inside a kanban column. Pending column gets the action
 * island; everything else is read-only — by design (see 24 audit: only
 * CONFIRMED/REJECTED transitions exist on the API surface, runtime status
 * machine handles IN_PROGRESS/FINISHED automatically).
 */
export function BookingCard({ booking, column }: Props) {
  return (
    <article className="rounded-xl border border-border-subtle bg-bg-card p-3">
      <header className="mb-2 flex items-start gap-2">
        {booking.clientAvatarUrl ? (
          <FocalImage
            src={booking.clientAvatarUrl}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border-subtle"
          />
        ) : (
          <span
            aria-hidden
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bg-input text-[10px] font-semibold text-text-sec ring-1 ring-border-subtle"
          >
            {initialsOf(booking.clientName)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-main">
            {booking.clientName}
          </p>
          {booking.visitTag ? (
            <p className="truncate text-[11px] text-text-sec">{booking.visitTag}</p>
          ) : (
            <p className="truncate text-[11px] text-text-sec">{T.guestClient}</p>
          )}
        </div>
        {column === "pending" && booking.isNewClient ? (
          <Badge variant="warning" className="shrink-0 text-[10px]">
            {T.newBadge}
          </Badge>
        ) : null}
        {column === "today" ? (
          <Badge variant="success" className="shrink-0 text-[10px]">
            {T.inProgressBadge}
          </Badge>
        ) : null}
      </header>

      <p className="mb-2 text-sm text-text-main">{booking.serviceTitle}</p>

      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 text-text-sec">
          <Clock className="h-3 w-3" aria-hidden />
          {booking.whenLabel}
        </span>
        <span className="font-display text-sm tabular-nums text-text-main">
          {formatRub(booking.price)}
        </span>
      </div>

      {column === "cancelled" && booking.changeComment ? (
        <p className="mb-2 line-clamp-2 text-[11px] text-text-sec">
          {booking.changeComment}
        </p>
      ) : null}

      {column === "pending" ? (
        <BookingCardActions bookingId={booking.id} />
      ) : null}

      {(column === "confirmed" || column === "today") &&
      booking.startAtUtc &&
      booking.endAtUtc ? (
        <BookingManageActions
          bookingId={booking.id}
          startAtUtc={booking.startAtUtc.toISOString()}
          durationMin={Math.max(
            15,
            Math.round(
              (booking.endAtUtc.getTime() - booking.startAtUtc.getTime()) / 60_000,
            ),
          )}
        />
      ) : null}

      {column === "done" && booking.reviewRating !== null ? (
        <p className="mt-2 text-center text-xs text-text-sec">
          {T.reviewLabelTemplate.replace(
            "{rating}",
            booking.reviewRating.toFixed(1),
          )}
        </p>
      ) : null}
    </article>
  );
}
