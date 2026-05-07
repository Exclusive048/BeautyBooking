import Link from "next/link";
import { redirect } from "next/navigation";
import { ProviderType } from "@prisma/client";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MasterPageHeader } from "@/features/master/components/master-page-header";
import { getSessionUser } from "@/lib/auth/session";
import {
  getMasterNotificationsData,
  parseSort,
  parseTab,
} from "@/lib/master/notifications.service";
import { prisma } from "@/lib/prisma";
import { UI_TEXT } from "@/lib/ui/text";
import { DaySeparator } from "./day-separator";
import { NotificationsEmptyState } from "./empty-state";
import { MarkAllReadButton } from "./mark-all-read-button";
import { NotificationCard } from "./notification-card";
import { NotificationsKpiCards } from "./notifications-kpi-cards";
import { NotificationsNotice } from "./notifications-notice";
import { NotificationsTabs } from "./notifications-tabs";
import { SortSelect } from "./sort-select";

const T = UI_TEXT.cabinetMaster;

type SearchParams = Record<string, string | string[] | undefined>;

type Props = {
  searchParams?: Promise<SearchParams>;
};

/**
 * Server orchestrator for `/cabinet/master/notifications`. Replaces the
 * 26-NOTIF-A1 minimal placeholder with the full redesigned page:
 * KPI strip → tabs → toolbar → notice → day-grouped feed.
 *
 * URL-driven state:
 *   - `?tab=` filters the feed (default `all`)
 *   - `?sort=` reorders inside groups (default `newest`)
 * Server re-runs on every URL change; client islands handle only the
 * interactive bits (mark-read, mark-all-read, sort dropdown, action
 * buttons that mutate the booking).
 */
export async function MasterNotificationsPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const tabRaw = typeof params.tab === "string" ? params.tab : null;
  const sortRaw = typeof params.sort === "string" ? params.sort : null;
  const activeTab = parseTab(tabRaw);
  const sort = parseSort(sortRaw);

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const master = await prisma.provider.findFirst({
    where: { ownerUserId: user.id, type: ProviderType.MASTER },
    select: { id: true },
  });
  if (!master) redirect("/403");

  const data = await getMasterNotificationsData({
    userId: user.id,
    masterId: master.id,
    phone: user.phone ?? null,
    activeTab,
    sort,
  });

  const now = new Date();

  return (
    <>
      <MasterPageHeader
        breadcrumb={[
          { label: T.pageHeader.breadcrumbHome, href: "/cabinet/master/dashboard" },
          { label: T.notifications.breadcrumb },
        ]}
        title={T.notifications.title}
        subtitle={T.notifications.subtitle}
        actions={
          <>
            {data.kpi.unreadCount > 0 ? <MarkAllReadButton /> : null}
            <Button asChild variant="ghost" size="icon" className="h-9 w-9 rounded-lg">
              <Link
                href="/cabinet/master/account?tab=notifications"
                aria-label={T.notifications.settingsAria}
              >
                <Settings className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </>
        }
      />

      <div className="space-y-6 px-4 py-6 md:px-6 lg:px-8">
        <NotificationsKpiCards stats={data.kpi} />

        <NotificationsTabs
          activeTab={data.activeTab}
          tabCounts={data.tabCounts}
          sort={data.sort}
        />

        <div className="flex items-center justify-between gap-3">
          <SortSelect value={data.sort} />
        </div>

        <NotificationsNotice />

        {data.groups.length === 0 ? (
          <NotificationsEmptyState />
        ) : (
          <div className="space-y-6">
            {data.groups.map((group) => (
              <section key={group.dayKey} className="space-y-3">
                <DaySeparator label={group.label} count={group.items.length} />
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <NotificationCard key={item.id} notification={item} now={now} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
