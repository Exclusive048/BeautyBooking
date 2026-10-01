import {
  AlertCircle,
  CalendarCheck,
  Calendar,
  UserX,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioBookingsKpis } from "../server/types";

const T = UI_TEXT.studioCabinet.bookingsV2.kpis;

type Tile = {
  icon: LucideIcon;
  label: string;
  value: string;
  sublabel: string;
};

// PWA-FIX-10 — общий `<StatTile>` вместо локальной копии.
function Card({ icon, label, value, sublabel }: Tile) {
  return <StatTile icon={icon} label={label} value={value} sublabel={sublabel} />;
}

export function BookingsKpiRow({ kpis }: { kpis: StudioBookingsKpis }) {
  const deltaLabel =
    kpis.revenueDeltaPercent === null
      ? T.revenueDelta
      : `${kpis.revenueDeltaPercent > 0 ? "+" : ""}${kpis.revenueDeltaPercent}% ${T.revenueDelta}`;

  const tiles: Tile[] = [
    {
      icon: Calendar,
      label: T.today,
      value: UI_FMT.count(kpis.todayCount),
      sublabel: T.todayContext
        .replace("{completed}", String(kpis.todayCompleted))
        .replace("{upcoming}", String(kpis.todayUpcoming)),
    },
    {
      icon: AlertCircle,
      label: T.needsAction,
      value: UI_FMT.count(kpis.needsActionCount),
      sublabel: T.needsActionContext.replace(
        "{count}",
        String(kpis.needsActionCount),
      ),
    },
    {
      icon: CalendarCheck,
      label: T.confirmed,
      value: UI_FMT.count(kpis.confirmedNext7Days),
      sublabel: T.confirmedContext,
    },
    {
      icon: Wallet,
      label: T.revenue,
      value: UI_FMT.priceLabel(kpis.revenueTodayKopeks),
      sublabel: deltaLabel,
    },
    {
      icon: UserX,
      label: T.noShow,
      value: UI_FMT.count(kpis.noShowLast7Days),
      sublabel: T.noShowContext,
    },
  ];

  return (
    <StatTileGrid columns={5}>
      {tiles.map((tile) => (
        <Card key={tile.label} {...tile} />
      ))}
    </StatTileGrid>
  );
}
