import {
  Layers,
  TrendingUp,
  Wallet,
  UserMinus,
  type LucideIcon,
} from "lucide-react";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioServicesKpis } from "../lib/types";

const T = UI_TEXT.studioCabinet.servicesV2.kpis;

type Tile = {
  icon: LucideIcon;
  label: string;
  value: string;
  sublabel: string;
  warn?: boolean;
};

// PWA-FIX-10 — общий `<StatTile>`; предупреждение «услуга без мастера» переехало
// с сырой пары `amber-*`/`dark:amber-*` на токен `warning` (UI-26/27).
function Card({ icon, label, value, sublabel, warn }: Tile) {
  return (
    <StatTile
      icon={icon}
      label={label}
      value={value}
      sublabel={sublabel}
      accent={warn ? "warning" : "neutral"}
    />
  );
}

export function ServicesKpiRow({ kpis }: { kpis: StudioServicesKpis }) {
  const tiles: Tile[] = [
    {
      icon: Layers,
      label: T.total,
      value: kpis.totalServices.toLocaleString("ru-RU"),
      sublabel: T.totalContext.replace("{count}", String(kpis.totalCategories)),
    },
    {
      icon: TrendingUp,
      label: T.popular,
      value: kpis.popularServiceName ?? "—",
      sublabel: T.popularContext.replace(
        "{count}",
        String(kpis.popularBookings30d),
      ),
    },
    {
      icon: Wallet,
      label: T.averageCheck,
      value: UI_FMT.priceLabel(kpis.averageCheckKopeks),
      sublabel: T.averageCheckDelta,
    },
    {
      icon: UserMinus,
      label: T.withoutMaster,
      value: kpis.servicesWithoutMaster.toLocaleString("ru-RU"),
      sublabel:
        kpis.servicesWithoutMaster === 0
          ? T.withoutMasterContext
          : T.withoutMasterWarn,
      warn: kpis.servicesWithoutMaster > 0,
    },
  ];

  return (
    <StatTileGrid columns={4}>
      {tiles.map((tile) => (
        <Card key={tile.label} {...tile} />
      ))}
    </StatTileGrid>
  );
}
