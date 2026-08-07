import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BookingCardActionsMenu } from "@/features/master/components/schedule/booking-card-actions-menu";
import { formatLocalHm } from "@/lib/schedule/timezone";
import { laneStyle, type LanePlacement } from "@/lib/calendar/lane-layout";
import type { ScheduleBookingItem } from "@/lib/master/schedule.service";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.schedule.bookingCard;

const formatRub = (kopeks: number) => UI_FMT.priceLabel(kopeks);

type Props = {
  booking: ScheduleBookingItem;
  topPx: number;
  heightPx: number;
  /**
   * FIX-BATCH-E: lane placement for overlapping bookings. `undefined` → full
   * width (no overlap). Drives the card's horizontal `left`/`width`.
   */
  placement?: LanePlacement;
  /**
   * EXP-019: master (salon) tz. The card LABEL must format in the same tz as
   * its grid POSITION (`startMinuteOfDay` = `getLocalTimeParts(date, masterTz)`)
   * — else the label and the slot it's drawn in disagree by the tz offset.
   */
  timezone: string;
};

/**
 * Calendar-grid booking card. Visual variant follows the brand legend:
 *   - new client    → emerald soft (border + tint, dark text)
 *   - pending       → amber soft (border + tint, amber text)
 *   - confirmed     → solid brand gradient (white text + glow)
 *
 * Height is dictated by the slot duration (1px/min at HOUR_PX=60 — a 30-min
 * booking card is 26px), so the CONTENT adapts to the height, not the
 * reverse (FIX-MASTER-01 item 3 — price used to clip mid-glyph on 75-min
 * bookings, and the NEW badge overflowed compact cards). Three tiers, each
 * budgeted against the real rendered row heights (`scrollHeight` measured):
 *   - < 44px  (≤ ~40 мин): time row only
 *   - < 68px  (≤ ~60 мин): + client name; new-client is conveyed by the
 *     emerald variant alone (the Badge is taller than the mono time row and
 *     was the compact-tier clip culprit)
 *   - ≥ 68px  (75 мин+):   + ONE merged «service · price» line + Badge
 * All information stays present on cards tall enough to hold it; nothing
 * renders half-cut.
 */
export function BookingCardWeek({ booking, topPx, heightPx, placement, timezone }: Props) {
  const { left, width } = laneStyle(placement);
  const isPending = booking.runtimeStatus === "PENDING" || booking.runtimeStatus === "CHANGE_REQUESTED";
  const isNewClient = booking.isNewClient;
  // Row budgets (worst case, bordered variants): py 8 + time 12 (+badge 18)
  // + name 17 + merged 17 — thresholds keep a few px of slack per tier.
  const showName = heightPx >= 44;
  const showDetails = heightPx >= 68;

  const variant: "confirmed" | "pending" | "new" = isPending
    ? "pending"
    : isNewClient
      ? "new"
      : "confirmed";

  const cardClass =
    variant === "confirmed"
      ? "bg-brand-gradient text-white shadow-brand"
      : variant === "pending"
        ? "border border-amber-400/60 bg-amber-100/40 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
        : "border border-emerald-500/60 bg-emerald-100/40 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200";

  return (
    <article
      className={`group absolute overflow-hidden rounded-lg px-2.5 py-1 ${cardClass}`}
      style={{
        top: topPx,
        left,
        width,
        height: heightPx - 4,
      }}
    >
      <div className="flex items-center justify-between gap-2 font-mono text-[10px] leading-none tabular-nums opacity-90">
        <span className="truncate">
          {formatLocalHm(booking.startAtUtc, timezone)}–{formatLocalHm(booking.endAtUtc, timezone)}
        </span>
        {isPending ? (
          <Clock className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
        ) : null}
        {isNewClient && !isPending && showDetails ? (
          <Badge
            variant="default"
            className="shrink-0 border-emerald-500/40 bg-emerald-500/15 py-0 text-[9px] leading-tight text-emerald-900 dark:text-emerald-100"
          >
            {T.newBadge}
          </Badge>
        ) : null}
      </div>

      {showName ? (
        <p className="mt-0.5 truncate text-xs font-semibold leading-tight">
          {booking.clientName}
        </p>
      ) : null}
      {showDetails ? (
        <p className="flex items-baseline justify-between gap-2 text-[11px] leading-tight">
          <span className="truncate opacity-80">{booking.serviceTitle}</span>
          <span className="shrink-0 font-display text-xs leading-tight tabular-nums">
            {formatRub(booking.price)}
          </span>
        </p>
      ) : null}

      <BookingCardActionsMenu
        bookingId={booking.id}
        rawStatus={booking.rawStatus}
        startAtUtc={booking.startAtUtc.toISOString()}
        durationMin={booking.durationMin}
        actionRequiredBy={booking.actionRequiredBy ?? null}
      />
    </article>
  );
}
