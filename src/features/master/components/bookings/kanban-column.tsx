import { BookingCard } from "@/features/master/components/bookings/booking-card";
import { EmptyColumn } from "@/features/master/components/bookings/empty-column";
import type { ColumnId, KanbanBookingItem } from "@/lib/master/bookings.service";

const moneyFmt = new Intl.NumberFormat("ru-RU");

function formatRub(value: number): string {
  return `${moneyFmt.format(Math.round(value))} ₽`;
}

const ACCENT_DOT: Record<ColumnId, string> = {
  pending: "bg-amber-500",
  confirmed: "bg-blue-500",
  today: "bg-primary",
  done: "bg-emerald-500",
  cancelled: "bg-text-sec/50",
};

type Props = {
  id: ColumnId;
  title: string;
  hint: string;
  bookings: KanbanBookingItem[];
};

/**
 * One vertical column in the bookings kanban. Header carries dot accent,
 * title, count, hint subtitle, and aggregated price; body lists cards or
 * the empty placeholder. Width is fixed (320px / 280px / 300px responsive)
 * so the parent scroll container can snap on each column.
 */
export function KanbanColumn({ id, title, hint, bookings }: Props) {
  const sum = bookings.reduce((s, b) => s + b.price, 0);
  return (
    <section className="flex w-[320px] shrink-0 snap-start flex-col lg:w-[280px] xl:w-[300px]">
      <header className="rounded-t-2xl border border-border-subtle bg-bg-card px-4 py-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${ACCENT_DOT[id]}`} />
            <h3 className="truncate font-display text-base text-text-main">{title}</h3>
          </div>
          <span className="font-mono text-xs font-medium tabular-nums text-text-sec">
            {bookings.length}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs">
          <p className="truncate text-text-sec">{hint}</p>
          <p className="font-medium tabular-nums text-text-main">{formatRub(sum)}</p>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-b-2xl border-x border-b border-border-subtle bg-bg-card/40 p-3">
        {bookings.length > 0 ? (
          bookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} column={id} />
          ))
        ) : (
          <EmptyColumn />
        )}
      </div>
    </section>
  );
}
