import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CRM_CLIENTS_WINDOW_MONTHS } from "@/lib/crm/clients-window";
import * as UI_TEXT from "@/lib/ui/text";
import { StudioPageHeader } from "@/features/studio-cabinet/components/studio-page-header";

const T = UI_TEXT.studioCabinet.clientsV2.header;
// PERF-06: подпись окна — shared-ключ обоих кабинетов (прецедент UI-33).
const WINDOW_NOTE = UI_TEXT.cabinetMaster.clients.windowNote(CRM_CLIENTS_WINDOW_MONTHS);

type Props = {
  totalCount: number;
  filteredCount: number;
};

/**
 * Header — caption + title + CRM window note + "Клиент" CTA.
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
    <StudioPageHeader
      caption={T.caption
        .replace("{total}", String(totalCount))
        .replace("{filtered}", String(filteredCount))}
      title={T.title}
      note={WINDOW_NOTE}
      actions={
        <Button variant="primary" asChild>
          <Link href="/cabinet/studio/calendar">
            <Plus className="h-4 w-4" aria-hidden />
            {T.addClient}
          </Link>
        </Button>
      }
    />
  );
}
