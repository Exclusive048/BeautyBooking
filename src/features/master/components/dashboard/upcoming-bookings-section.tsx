import Link from "next/link";
import { ArrowRight, Calendar } from "lucide-react";
import { BookingRow } from "@/features/master/components/dashboard/booking-row";
import type { DashboardBooking } from "@/lib/master/dashboard.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.dashboard.bookings;

function pluralizeBookings(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "запись";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "записи";
  return "записей";
}

type Props = {
  /** Bookings already in the future relative to "now" — not the entire day. */
  upcoming: DashboardBooking[];
  /** Total today count for the subtitle ("ещё 3 из 6"). */
  totalTodayCount: number;
};

const VISIBLE_LIMIT = 3;

export function UpcomingBookingsSection({ upcoming, totalTodayCount }: Props) {
  const visible = upcoming.slice(0, VISIBLE_LIMIT);
  const subtitle = T.subtitleTemplate
    .replace("{count}", String(upcoming.length))
    .replace("{plural}", pluralizeBookings(upcoming.length))
    .concat(totalTodayCount > 0 ? ` из ${totalTodayCount}` : "");

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card">
      <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0">
          <h2 className="font-display text-lg text-text-main">{T.title}</h2>
          <p className="mt-0.5 text-xs text-text-sec">{subtitle}</p>
        </div>
        <Link
          href="/cabinet/master/bookings"
          className="inline-flex shrink-0 items-center gap-1 text-sm text-primary transition-colors hover:underline"
        >
          {T.seeAll}
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </header>

      {visible.length > 0 ? (
        <div className="divide-y divide-border-subtle">
          {visible.map((booking) => (
            <BookingRow key={booking.id} booking={booking} />
          ))}
        </div>
      ) : (
        <div className="px-5 pb-8 pt-4 text-center">
          <Calendar
            aria-hidden
            className="mx-auto mb-3 h-12 w-12 text-text-sec/50"
          />
          <p className="font-display text-base text-text-main">{T.emptyTitle}</p>
          <p className="mt-1 text-sm text-text-sec">{T.emptyDescription}</p>
        </div>
      )}
    </section>
  );
}
