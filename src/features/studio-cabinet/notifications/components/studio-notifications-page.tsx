import * as UI_TEXT from "@/lib/ui/text";
import type { StudioNotificationsData } from "../lib/types";
import { NotificationsFeed } from "./notifications-feed";
import { NotificationsFilters } from "./notifications-filters";

const H = UI_TEXT.studioCabinet.notificationsV2.header;

type Props = {
  data: StudioNotificationsData;
};

/**
 * Server orchestrator for `/cabinet/studio/notifications`. Lays out
 * header → 10-chip filters + sort + bulk mark-read → day-grouped feed.
 * Плиток со счётчиками и поясняющей плашки нет: число непрочитанных — на
 * фильтре «Непрочитанные», лента начинается сразу под заголовком.
 */
export function StudioNotificationsPage({ data }: Props) {
  return (
    <div className="space-y-3 lg:space-y-6">
      <header className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight text-text-main md:text-3xl">
          {H.title}
        </h1>
      </header>
      <NotificationsFilters
        activeChip={data.activeChip}
        sort={data.sort}
        counts={data.chipCounts}
      />
      <NotificationsFeed groups={data.groups} timeZone={data.timeZone} />
    </div>
  );
}
