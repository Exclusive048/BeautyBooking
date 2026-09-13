import { Camera, Clock, MailOpen } from "lucide-react";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import type { ReviewStats } from "@/lib/master/reviews-stats";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.reviews.kpi;

type Props = {
  stats: ReviewStats;
  responseTimeLabel: string | null;
};

/**
 * Три плитки рядом с диаграммой распределения оценок.
 *
 * PWA-FIX-10 — общий `<StatTile>`; акцент «есть неотвеченные» переехал с сырой
 * пары `amber-*`/`dark:amber-*` на токен `warning` (UI-26/27). Сетка — `columns={3}`:
 * на телефоне это две колонки (третья плитка уезжает вниз), потому что три плитки
 * в ряд на 375px обрезают подписи.
 */
export function ReviewsKpiTiles({ stats, responseTimeLabel }: Props) {
  return (
    <StatTileGrid columns={3}>
      <StatTile
        icon={MailOpen}
        label={T.unansweredLabel}
        value={stats.unansweredCount > 0 ? String(stats.unansweredCount) : T.unansweredNone}
        accent={stats.unansweredCount > 0 ? "warning" : "neutral"}
      />
      <StatTile
        icon={Clock}
        label={T.responseTimeLabel}
        value={responseTimeLabel ?? T.responseTimeNone}
      />
      <StatTile
        icon={Camera}
        label={T.photosLabel}
        value={stats.withPhotosCount > 0 ? String(stats.withPhotosCount) : T.photosNone}
      />
    </StatTileGrid>
  );
}
