import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BookingRow } from "@/features/master/components/dashboard/booking-row";
import type { DashboardBooking } from "@/lib/master/dashboard.service";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.dashboard.bookings;

type Props = {
  /** Bookings already in the future relative to "now" — not the entire day. */
  upcoming: DashboardBooking[];
  /** Total today count for the subtitle ("ещё 3 из 6"). */
  totalTodayCount: number;
  /** Выручка по записям на сегодня, копейки (DASHBOARD-REORDER: была плиткой KPI). */
  todayRevenueKopeks: number;
  /** Salon (master) tz — EXP-017: booking times shown in salon-tz, matching the kanban. */
  timezone: string;
  /** STUDIO-MASTER-PROFILES (этап 3): пометка «Личная / Студия» на строках. */
  showWorkContext?: boolean;
};

const VISIBLE_LIMIT = 3;

/**
 * «Ближайшие записи» главной кабинета мастера: оставшиеся на сегодня, первые
 * три; всё остальное — в расписании (ссылка «Всё расписание», запрос владельца
 * 2026-10-31).
 */
export function UpcomingBookingsSection({
  upcoming,
  totalTodayCount,
  todayRevenueKopeks,
  timezone,
  showWorkContext = false,
}: Props) {
  const visible = upcoming.slice(0, VISIBLE_LIMIT);
  // UX-PASS-01: склонение и «из N» — в тексте домена, а не в компоненте.
  const subtitle = T.subtitle(
    upcoming.length,
    totalTodayCount,
    todayRevenueKopeks > 0 ? UI_FMT.priceLabel(todayRevenueKopeks) : null,
  );

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card">
      <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-4 md:px-5">
        <div className="min-w-0">
          <h2 className="font-display text-lg text-text-main">{T.title}</h2>
          {upcoming.length > 0 ? <p className="mt-0.5 text-xs text-text-sec">{subtitle}</p> : null}
        </div>
        <Link
          href="/cabinet/master/schedule"
          className="inline-flex shrink-0 items-center gap-1 text-sm text-accent-text transition-colors hover:underline"
        >
          {T.toSchedule}
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </header>

      {visible.length > 0 ? (
        <div className="divide-y divide-border-subtle border-t border-border-subtle">
          {visible.map((booking) => (
            <BookingRow
              key={booking.id}
              booking={booking}
              timezone={timezone}
              showWorkContext={showWorkContext}
            />
          ))}
        </div>
      ) : (
        <p className="px-4 pb-4 text-sm text-text-sec md:px-5">{T.emptyTitle}</p>
      )}
    </section>
  );
}
