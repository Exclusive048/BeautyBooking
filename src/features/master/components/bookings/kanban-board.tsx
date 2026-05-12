import { KanbanColumn } from "@/features/master/components/bookings/kanban-column";
import type { ColumnId, KanbanData } from "@/lib/master/bookings.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.bookings.columns;

const COLUMN_ORDER: Array<{ id: ColumnId; title: string; hint: string }> = [
  { id: "pending", title: T.pending.title, hint: T.pending.hint },
  { id: "confirmed", title: T.confirmed.title, hint: T.confirmed.hint },
  { id: "today", title: T.today.title, hint: T.today.hint },
  { id: "done", title: T.done.title, hint: T.done.hint },
  { id: "cancelled", title: T.cancelled.title, hint: T.cancelled.hint },
];

type Props = {
  columns: KanbanData["columns"];
};

/**
 * Five-column horizontal kanban. Mobile: one column per viewport with
 * scroll-snap; desktop: as many columns visible as the viewport allows.
 * Negative inline margins on small screens let the first/last column hug
 * the viewport edge so swipe feels natural without an extra padding ring.
 */
export function KanbanBoard({ columns }: Props) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6 lg:mx-0 lg:px-0">
      <div className="flex snap-x snap-mandatory gap-4">
        {COLUMN_ORDER.map((col) => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            title={col.title}
            hint={col.hint}
            bookings={columns[col.id]}
          />
        ))}
      </div>
    </div>
  );
}
