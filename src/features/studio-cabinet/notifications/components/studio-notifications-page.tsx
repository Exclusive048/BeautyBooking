import * as UI_TEXT from "@/lib/ui/text";
import { StudioPageHeader } from "@/features/studio-cabinet/components/studio-page-header";
import type { StudioNotificationsData } from "../lib/types";
import { NotificationsFeed } from "./notifications-feed";
import { NotificationsFilters } from "./notifications-filters";
import { NotificationsKpiRow } from "./notifications-kpi-row";

const H = UI_TEXT.studioCabinet.notificationsV2.header;

type Props = {
  data: StudioNotificationsData;
};

/**
 * Server orchestrator for `/cabinet/studio/notifications`. Lays out
 * header → 4 KPI tiles → 10-chip filters + sort + bulk
 * mark-read → day-grouped feed.
 */
export function StudioNotificationsPage({ data }: Props) {
  return (
    <div className="space-y-5 lg:space-y-6">
      <StudioPageHeader
        caption={H.caption
          .replace("{unread}", String(data.kpi.unreadCount))
          .replace("{total}", String(data.kpi.totalCount))}
        title={H.title}
      />
      <NotificationsKpiRow kpi={data.kpi} />
      <NotificationsFilters
        activeChip={data.activeChip}
        sort={data.sort}
        counts={data.chipCounts}
      />
      <NotificationsFeed groups={data.groups} timeZone={data.timeZone} />
    </div>
  );
}
