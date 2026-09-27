import { redirect } from "next/navigation";
import { BookingsToolbar } from "@/features/master/components/bookings/bookings-toolbar";
import { KanbanBoard } from "@/features/master/components/bookings/kanban-board";
import { NewBookingButton } from "@/features/master/components/manual-booking/new-booking-button";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { FocusHighlighter } from "@/components/cabinet/focus-highlighter";
import { getSessionUserId } from "@/lib/auth/session";
import { getCurrentMasterProviderId, getMasterWorkProfiles } from "@/lib/master/access";
import {
  getMasterBookingsForKanban,
  type KanbanFilters,
} from "@/lib/master/bookings.service";
import { verifyClientKeyToken } from "@/lib/master/client-key-token";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster;

type Props = {
  /** URL query already extracted by the page-level route component. */
  searchParams: { q?: string; tab?: string; client?: string };
};

function parseTab(value: string | undefined): KanbanFilters["tab"] {
  if (value === "new" || value === "regular") return value;
  return "all";
}

/**
 * Server orchestrator for `/cabinet/master/bookings`. Reads URL filters,
 * fetches the kanban dataset in one round-trip, then composes:
 *   - Sticky page header with breadcrumb + title + new-booking CTA
 *   - Toolbar (search + tabs + stats) — client island
 *   - 5-column kanban board
 *
 * The "+ Новая запись" CTA links to the dashboard's manual-booking modal
 * via `?manual=1` rather than embedding a second copy here. Master rarely
 * creates new bookings from the bookings page itself; this stays simple
 * until usage data argues otherwise.
 */
export async function MasterBookingsPage({ searchParams }: Props) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const masterId = await getCurrentMasterProviderId(userId);
  // MASTER-CLIENTS-FIX-A #7а: verify the client-history token against
  // the current master scope. Invalid/expired/cross-master tokens fall
  // through silently — UI then shows the full kanban with no filter
  // (matches pre-fix behaviour) instead of erroring. The link's
  // primary purpose is shareable-within-cabinet, not enforcement.
  const clientKey = searchParams.client
    ? verifyClientKeyToken({ token: searchParams.client, masterProviderId: masterId })
    : null;
  const filters: KanbanFilters = {
    search: searchParams.q ?? "",
    tab: parseTab(searchParams.tab),
    clientKey: clientKey ?? undefined,
  };
  // STUDIO-MASTER-PROFILES (этап 4): записи всех профилей мастера.
  const workProfiles = await getMasterWorkProfiles(userId);
  const data = await getMasterBookingsForKanban({ masterId, filters, workProfiles });

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: T.bookings.breadcrumb },
        ]}
        title={T.bookings.title}
        subtitle={T.bookings.subtitle}
        actions={<NewBookingButton label={T.pageHeader.newBookingCta} className="rounded-xl" />}
      />
      <FocusHighlighter />

      <div className="space-y-4 px-4 py-6 md:px-6 lg:px-8">
        <BookingsToolbar
          initialSearch={filters.search ?? ""}
          initialTab={filters.tab ?? "all"}
          stats={data.stats}
        />
        <KanbanBoard columns={data.columns} showWorkContext={data.showWorkContext} />
      </div>
    </>
  );
}
