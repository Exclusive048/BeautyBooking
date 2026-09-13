import { Layers, Package, EyeOff } from "lucide-react";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import type { ServicesKpi } from "@/lib/master/services-view.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.servicesPage.kpi;

type Props = {
  kpi: ServicesKpi;
};

/**
 * PWA-FIX-10 — общий `<StatTile>`; акцент «есть отключённые» переехал с сырой
 * пары `amber-*`/`dark:amber-*` на токен `warning` (UI-26/27).
 */
export function ServicesKpiStrip({ kpi }: Props) {
  return (
    <StatTileGrid columns={3}>
      <StatTile icon={Layers} label={T.servicesLabel} value={String(kpi.servicesCount)} />
      <StatTile icon={Package} label={T.bundlesLabel} value={String(kpi.bundlesCount)} />
      <StatTile
        icon={EyeOff}
        label={T.disabledLabel}
        value={String(kpi.disabledCount)}
        accent={kpi.disabledCount > 0 ? "warning" : "neutral"}
      />
    </StatTileGrid>
  );
}
