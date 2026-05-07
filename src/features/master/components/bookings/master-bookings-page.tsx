import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookingsToolbar } from "@/features/master/components/bookings/bookings-toolbar";
import { KanbanBoard } from "@/features/master/components/bookings/kanban-board";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { getSessionUserId } from "@/lib/auth/session";
import { getCurrentMasterProviderId } from "@/lib/master/access";
import {
  getMasterBookingsForKanban,
  type KanbanFilters,
} from "@/lib/master/bookings.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster;

type Props = {
  /** URL query already extracted by the page-level route component. */
  searchParams: { q?: string; tab?: string };
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
  const filters: KanbanFilters = {
    search: searchParams.q ?? "",
    tab: parseTab(searchParams.tab),
  };
  const data = await getMasterBookingsForKanban({ masterId, filters });

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: T.bookings.breadcrumb },
        ]}
        title={T.bookings.title}
        subtitle={T.bookings.subtitle}
        actions={
          <Button asChild variant="primary" size="md" className="rounded-xl">
            <Link href="/cabinet/master/dashboard?manual=1">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              {T.pageHeader.newBookingCta}
            </Link>
          </Button>
        }
      />

      <div className="space-y-4 px-4 py-6 md:px-6 lg:px-8">
        <BookingsToolbar
          initialSearch={filters.search ?? ""}
          initialTab={filters.tab ?? "all"}
          stats={data.stats}
        />
        <KanbanBoard columns={data.columns} />
      </div>
    </>
  );
}
