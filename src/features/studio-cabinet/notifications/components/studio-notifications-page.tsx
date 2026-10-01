import * as UI_TEXT from "@/lib/ui/text";
import type { StudioNotificationsData } from "../lib/types";
import { NotificationsFeed } from "./notifications-feed";
import { NotificationsFilters } from "./notifications-filters";
import { NotificationsInfoBanner } from "./notifications-info-banner";
import { NotificationsKpiRow } from "./notifications-kpi-row";

const H = UI_TEXT.studioCabinet.notificationsV2.header;

type Props = {
  data: StudioNotificationsData;
};

/**
 * Server orchestrator for `/cabinet/studio/notifications`. Lays out
 * header → 4 KPI tiles → info banner → 10-chip filters + sort + bulk
 * mark-read → day-grouped feed.
 */
export function StudioNotificationsPage({ data }: Props) {
  return (
    <div className="space-y-5 lg:space-y-6">
      <header className="min-w-0">
        <p className="mb-1 font-mono text-3xs uppercase tracking-[0.18em] text-text-sec">
          {H.caption
            .replace("{unread}", String(data.kpi.unreadCount))
            .replace("{total}", String(data.kpi.totalCount))}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-text-main md:text-3xl">
          {H.title}
        </h1>
        <p className="mt-1 max-w-xl text-sm text-text-sec">{H.subtitle}</p>
      </header>
      <NotificationsKpiRow kpi={data.kpi} />
      <NotificationsInfoBanner />
      <NotificationsFilters
        activeChip={data.activeChip}
        sort={data.sort}
        counts={data.chipCounts}
      />
      <NotificationsFeed groups={data.groups} timeZone={data.timeZone} />
    </div>
  );
}
