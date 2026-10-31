import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.clientsV2.header;

/**
 * Header — title + "Клиент" CTA. Описания и строки со счётчиками нет: число
 * клиентов видно в сегментах, подпись окна CRM (PERF-06) — над таблицей.
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
export function ClientsHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="min-w-0 font-display text-2xl font-bold tracking-tight text-text-main md:text-3xl">
        {T.title}
      </h1>
      <Button variant="primary" asChild>
        <Link href="/cabinet/studio/calendar">
          <Plus className="h-4 w-4" aria-hidden />
          {T.addClient}
        </Link>
      </Button>
    </header>
  );
}
