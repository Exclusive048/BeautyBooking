import {
  Bell,
  Calendar,
  CheckCircle2,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { StatTile, StatTileGrid } from "@/components/ui/stat-tile";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioNotificationsKpi } from "../lib/types";

const T = UI_TEXT.studioCabinet.notificationsV2.kpis;

type Props = {
  kpi: StudioNotificationsKpi;
};

export function NotificationsKpiRow({ kpi }: Props) {
  return (
    <StatTileGrid columns={4}>
      <Tile
        icon={Bell}
        label={T.unread}
        value={String(kpi.unreadCount)}
        sub={T.unreadTemplate
          .replace("{count}", String(kpi.unreadCount))
          .replace("{total}", String(kpi.totalCount))}
        accent={kpi.unreadCount > 0}
      />
      <Tile
        icon={Calendar}
        label={T.today}
        value={String(kpi.todayCount)}
        sub={T.todayTemplate.replace("{count}", String(kpi.todayCount))}
      />
      <Tile
        icon={CheckCircle2}
        label={T.needsDecision}
        value={String(kpi.needsDecisionCount)}
        sub={T.needsDecisionTemplate.replace("{count}", String(kpi.needsDecisionCount))}
        accent={kpi.needsDecisionCount > 0}
      />
      <Tile
        icon={Smartphone}
        label={T.push}
        value={kpi.pushEnabled ? T.pushEnabled : T.pushDisabled}
        sub={T.pushHint}
      />
    </StatTileGrid>
  );
}

/**
 * PWA-FIX-10 - общий StatTile. Пропс `narrow` («значение - это подпись, а не
 * число, рендерить телесным кеглем») удалён вместе с локальной плиткой: у общего
 * примитива кегль значения один, а `tabular-nums` на нечисловой строке ничего не
 * меняет - то есть различать эти два случая было не нужно.
 */
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
