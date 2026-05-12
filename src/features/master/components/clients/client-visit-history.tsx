import { Star } from "lucide-react";
import type { ClientDetailView } from "@/lib/master/clients-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { formatNumberShort, formatShortDate } from "./lib/format";

const T = UI_TEXT.cabinetMaster.clients.detail.history;

type Props = {
  visits: ClientDetailView["recentVisits"];
};

/**
 * Compact visit history (last 3 FINISHED). 27a doesn't carry rating yet
 * — `rating` is shown when the underlying booking has a Review attached
 * in a future enhancement. For now we render "без оценки" placeholder so
 * the column always lines up.
 *
 * The "Все →" link is intentionally omitted in 27a — full history page
 * lives behind a backlog item; the visible 3 rows cover 90% of the
 * "what did this client do recently?" question.
 */
export function ClientVisitHistory({ visits }: Props) {
  if (visits.length === 0) {
    return (
      <section className="py-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {T.heading}
        </p>
        <p className="text-sm italic text-text-sec">{T.empty}</p>
      </section>
    );
  }

  return (
    <section className="py-4">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
        {T.heading}
      </p>
      <ul className="space-y-1.5">
        {visits.map((visit) => (
          <li
            key={visit.bookingId}
            className="flex flex-wrap items-center gap-3 rounded-xl bg-bg-input px-3 py-2 text-sm"
          >
            <span className="w-16 shrink-0 font-mono text-xs text-text-sec">
              {formatShortDate(visit.date)}
            </span>
            <span className="min-w-0 flex-1 truncate text-text-main">{visit.serviceName}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-text-sec/70">
              <Star className="h-3 w-3 opacity-40" aria-hidden />
              {T.noRating}
            </span>
            <span className="shrink-0 font-mono text-xs font-medium text-text-main tabular-nums">
              {formatNumberShort(visit.amount)} ₽
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
