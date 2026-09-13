import { EyeOff, ImageIcon, Sparkles } from "lucide-react";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import type { PortfolioKpi } from "@/lib/master/portfolio-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.portfolioPage.kpi;

type Props = {
  kpi: PortfolioKpi;
};

/**
 * Три плитки — всего / опубликовано / скрыто. PWA-FIX-10: общий `<StatTile>`
 * вместо локальной копии; страница и без того несёт много карточек ниже, поэтому
 * компактная форма здесь особенно к месту.
 */
export function PortfolioKpiStrip({ kpi }: Props) {
  return (
    <StatTileGrid columns={3}>
      <StatTile icon={ImageIcon} label={T.totalLabel} value={String(kpi.totalCount)} />
      <StatTile
        icon={Sparkles}
        label={T.publicLabel}
        value={String(kpi.publicCount)}
        accent={kpi.publicCount > 0 ? "primary" : "neutral"}
      />
      <StatTile icon={EyeOff} label={T.hiddenLabel} value={String(kpi.hiddenCount)} />
    </StatTileGrid>
  );
}
