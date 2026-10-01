import { Heart, Repeat, Users, Wallet } from "lucide-react";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import type { ClientsKpi } from "@/lib/master/clients-view.service";
import * as UI_TEXT from "@/lib/ui/text";
import { UI_FMT } from "@/lib/ui/fmt";

const T = UI_TEXT.cabinetMaster.clients.kpi;

type Props = {
  stats: ClientsKpi;
};

/**
 * Полоса показателей вверху страницы клиентов.
 *
 * PWA-FIX-10 — общий `<StatTile>`; акцент «удержание ≥50%» переехал с сырой пары
 * `emerald-200 dark:emerald-900/40` на токен `success` (UI-26/27). Подпись
 * «Общая выручка» сохраняет `labelTooltip`: формулировка короче, чем смысл, и
 * одна строка пояснения нужна читателю впервые.
 */
export function ClientsKpiCards({ stats }: Props) {
  return (
    <StatTileGrid columns={4}>
      <StatTile
        icon={Users}
        label={T.totalLabel}
        value={String(stats.totalCount)}
        sublabel={
          stats.newThisMonthCount > 0
            ? T.totalSubtextTemplate.replace("{count}", String(stats.newThisMonthCount))
            : T.totalSubtextNone
        }
        accent={stats.newThisMonthCount > 0 ? "primary" : "neutral"}
      />
      <StatTile
        icon={Wallet}
        label={T.ltvLabel}
        labelTooltip={T.ltvLabelTooltip}
        value={UI_FMT.priceLabelOrDash(stats.totalLtv)}
        sublabel={T.ltvSubtextTemplate.replace("{avg}", UI_FMT.priceLabelOrDash(stats.avgLtv))}
      />
      <StatTile
        icon={Repeat}
        label={T.frequencyLabel}
        value={stats.avgFrequency.toFixed(1)}
        sublabel={T.frequencySubtext}
      />
      <StatTile
        icon={Heart}
        label={T.retentionLabel}
        value={`${stats.retentionPct}%`}
        sublabel={T.retentionSubtext}
        accent={stats.retentionPct >= 50 ? "success" : "neutral"}
      />
    </StatTileGrid>
  );
}
