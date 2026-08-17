import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CRM_CLIENTS_WINDOW_MONTHS } from "@/lib/crm/clients-window";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.clientsV2.header;
// PERF-06: подпись окна — shared-ключ обоих кабинетов (прецедент UI-33).
const WINDOW_NOTE = UI_TEXT.cabinetMaster.clients.windowNote(CRM_CLIENTS_WINDOW_MONTHS);

type Props = {
  totalCount: number;
  filteredCount: number;
};

/**
 * Header — caption + title + subtitle + "Клиент" CTA.
 *
 * The CTA links to `/cabinet/studio/calendar` instead of opening a
 * standalone create-client dialog. Rationale: the clients table is
 * sourced from booking history (`groupBookings`), and `ClientCard` has
 * no name field. A new client therefore only becomes visible once
 * they've been booked — adding them through the calendar's
 * create-booking-dialog (STUDIO-SCHEDULE-A) captures phone + name +
 * service + master + time in one pass and keeps the data model honest.
 * "Card-only" creation (notes + tags without a booking) lives in the
 * client-card drawer once a row exists.
 */
export function ClientsHeader({ totalCount, filteredCount }: Props) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
          {T.caption
            .replace("{total}", String(totalCount))
            .replace("{filtered}", String(filteredCount))}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-text-main md:text-3xl">
          {T.title}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-text-sec">{`${T.subtitle} ${WINDOW_NOTE[0].toUpperCase()}${WINDOW_NOTE.slice(1)}.`}</p>
      </div>
      <Button variant="primary" asChild>
        <Link href="/cabinet/studio/calendar">
          <Plus className="h-4 w-4" aria-hidden />
          {T.addClient}
        </Link>
      </Button>
    </header>
  );
}
