import { BookingCard } from "@/features/master/components/bookings/booking-card";
import { EmptyColumn } from "@/features/master/components/bookings/empty-column";
import type { ColumnId, KanbanBookingItem } from "@/lib/master/bookings.service";
import { cn } from "@/lib/cn";
import { UI_FMT } from "@/lib/ui/fmt";

const formatRub = (kopeks: number) => UI_FMT.priceLabel(kopeks);

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
  showWorkContext?: boolean;
};

/**
 * One vertical column in the bookings kanban. Header carries dot accent,
 * title, count, hint subtitle, and aggregated price; body lists cards or
 * the empty placeholder. Width is fixed (320px / 280px / 300px responsive)
 * so the parent scroll container can snap on each column.
 *
 * FIX-VISUAL-POLISH G6: on desktop (lg+) the column is height-capped so a
 * long column (e.g. «Завершены» with dozens of cards) scrolls INSIDE its
 * body instead of ballooning the whole page to several viewports. Combined
 * with the board's `items-start`, columns read as cards, not stretched
 * bands. Mobile keeps natural page-scroll.
 *
 * PWA-UX-BATCH-01 (2026-09-15): на телефоне колонка была `w-[320px]` при
 * 343px контента — то есть ровно один столбец на экран, и о соседних
 * колонках ничто не сообщало. Теперь колонка с записями — 272px (край
 * следующей виден, свайп читается), а ПУСТАЯ колонка схлопывается до
 * 136px: заголовок + счётчик «0», подсказка и сумма скрыты ниже `lg`.
 * Десктоп не менялся.
 */
export function KanbanColumn({ id, title, hint, bookings, showWorkContext = false }: Props) {
  const sum = bookings.reduce((s, b) => s + b.price, 0);
  const collapsed = bookings.length === 0;
  return (
    <section
      data-testid={`bookings-column-${id}`}
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "flex shrink-0 snap-start flex-col lg:max-h-[calc(100dvh-var(--topbar-h)-12rem)] lg:w-[280px] xl:w-[300px]",
        collapsed ? "w-[136px]" : "w-[272px]",
      )}
    >
      <header className="rounded-t-2xl border border-border-subtle bg-bg-card px-3 py-3 lg:px-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${ACCENT_DOT[id]}`} />
            <h3 className="truncate font-display text-base text-text-main">{title}</h3>
          </div>
          <span className="font-mono text-xs font-medium tabular-nums text-text-sec">
            {bookings.length}
          </span>
        </div>
        <div
          className={cn(
            "items-center justify-between gap-2 text-xs",
            collapsed ? "hidden lg:flex" : "flex",
          )}
        >
          <p className="truncate text-text-sec">{hint}</p>
          <p className="font-medium tabular-nums text-text-main">{formatRub(sum)}</p>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-b-2xl border-x border-b border-border-subtle bg-bg-card/40 p-3">
        {bookings.length > 0 ? (
          bookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} column={id} showWorkContext={showWorkContext} />
          ))
        ) : (
          <EmptyColumn />
        )}
      </div>
    </section>
  );
}
