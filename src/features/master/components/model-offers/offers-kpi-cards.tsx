import { Archive, Inbox, Sparkles, TrendingUp } from "lucide-react";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import type { OffersKpi } from "@/lib/master/model-offers-view.service";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.modelOffers.kpi;

type Props = {
  kpi: OffersKpi;
};

/**
 * Четыре плитки показателей вверху страницы модель-офферов.
 *
 * PWA-FIX-10 — общий `<StatTile>`; акцент «есть необработанные» переехал с сырой
 * пары `amber-*`/`dark:amber-*` на токен `warning` (UI-26/27). Пустые значения
 * по-прежнему рендерятся курируемой строкой, а не нулём, чтобы свежая страница
 * не читалась как сломанная.
 */
export function OffersKpiCards({ kpi }: Props) {
  return (
    <StatTileGrid columns={4}>
      <StatTile
        icon={Sparkles}
        label={T.activeOffersLabel}
        value={kpi.activeOffersCount > 0 ? String(kpi.activeOffersCount) : T.activeOffersEmpty}
        accent={kpi.activeOffersCount > 0 ? "primary" : "neutral"}
      />
      <StatTile
        icon={Inbox}
        label={T.pendingLabel}
        value={
          kpi.pendingApplicationsCount > 0
            ? String(kpi.pendingApplicationsCount)
            : T.pendingEmpty
        }
        accent={kpi.pendingApplicationsCount > 0 ? "warning" : "neutral"}
      />
      <StatTile
        icon={TrendingUp}
        label={T.conversionLabel}
        value={kpi.conversionRate !== null ? `${kpi.conversionRate}%` : T.conversionEmpty}
      />
      <StatTile
        icon={Archive}
        label={T.archivedLabel}
        value={kpi.archivedCount > 0 ? String(kpi.archivedCount) : T.archivedEmpty}
      />
    </StatTileGrid>
  );
}
