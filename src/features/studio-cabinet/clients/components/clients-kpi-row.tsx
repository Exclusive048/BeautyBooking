import { Crown, Heart, Moon, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioClientsKpis } from "../lib/types";

const T = UI_TEXT.studioCabinet.clientsV2.kpis;

type Props = {
  kpis: StudioClientsKpis;
};

export function ClientsKpiRow({ kpis }: Props) {
  return (
    <StatTileGrid columns={5}>
      <Tile
        icon={Users}
        label={T.total}
        value={String(kpis.total.count)}
        sub={T.totalSub.replace("{count}", String(kpis.total.addedThisMonth))}
      />
      <Tile
        icon={Heart}
        label={T.active}
        value={String(kpis.active30d.count)}
        sub={T.activeSub.replace("{percent}", String(kpis.active30d.percentOfBase))}
      />
      <Tile
        icon={TrendingUp}
        label={T.avgLifetime}
        value={UI_FMT.priceLabel(kpis.avgLifetime.kopeks)}
        sub={T.avgLifetimeSub}
      />
      <Tile
        icon={Crown}
        label={T.vip}
        value={String(kpis.vip.count)}
        sub={T.vipSub.replace("{percent}", String(kpis.vip.revenuePercent))}
        accent
      />
      <Tile
        icon={Moon}
        label={T.sleeping}
        value={String(kpis.sleeping.count)}
        sub={T.sleepingSub}
      />
    </StatTileGrid>
  );
}

// PWA-FIX-10 - общий StatTile. Иконка теперь приходит КОМПОНЕНТОМ, а не готовым
// элементом: примитив сам задаёт её размер и бокс, иначе размер пришлось бы
// повторять на каждом вызове.
function Tile({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <StatTile
      icon={icon}
      label={label}
      value={value}
      sublabel={sub}
      accent={accent ? "primary" : "neutral"}
    />
  );
}
