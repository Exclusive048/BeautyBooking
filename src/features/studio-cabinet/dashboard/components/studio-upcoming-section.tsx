import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { StudioBookingRow } from "@/features/studio-cabinet/bookings/server/types";
import { BOOKING_STATUS_GROUPS } from "@/lib/bookings/status-groups";
import { formatLocalHm } from "@/lib/schedule/timezone";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.dashboardV2.upcoming;

const AWAITING = new Set<string>(BOOKING_STATUS_GROUPS.awaiting);

type Props = {
  items: StudioBookingRow[];
  /** Сколько всего осталось на сегодня (в списке — первые несколько). */
  total: number;
  /** Пояс студии: время записей — salon-tz (rule 17), как в журнале. */
  timeZone: string;
};

/**
 * «Ближайшие записи» главной студии (DASHBOARD-REORDER): оставшиеся на
 * сегодня, первые несколько; всё остальное — в календаре («Весь календарь»).
 * Строка открывает запись в журнале (`?focus=`).
 */
export function StudioUpcomingSection({ items, total, timeZone }: Props) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card" data-testid="studio-upcoming">
      <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-4 md:px-5">
        <div className="min-w-0">
          <h2 className="font-display text-lg text-text-main">{T.title}</h2>
          {total > 0 ? <p className="mt-0.5 text-xs text-text-sec">{T.subtitle(items.length, total)}</p> : null}
        </div>
        <Link
          href="/cabinet/studio/calendar"
          className="inline-flex shrink-0 items-center gap-1 text-sm text-accent-text transition-colors hover:underline"
        >
          {T.toCalendar}
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </header>

      {items.length > 0 ? (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {items.map((booking) => (
            <li key={booking.id}>
              <Link
                href={`/cabinet/studio/bookings?focus=${encodeURIComponent(booking.id)}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-input/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 md:px-5"
              >
                <span className="w-12 shrink-0 font-display text-base tabular-nums text-text-main">
                  {formatLocalHm(new Date(booking.startAtUtc), timeZone)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium text-text-main">{booking.client.displayName}</span>
                    {AWAITING.has(booking.status) ? (
                      <Badge size="xs" variant="warning" className="shrink-0">
                        {T.awaitingBadge}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs text-text-sec">
                    {booking.service.name} · {booking.master.displayName}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 pb-4 text-sm text-text-sec md:px-5">{T.empty}</p>
      )}
    </section>
  );
}
