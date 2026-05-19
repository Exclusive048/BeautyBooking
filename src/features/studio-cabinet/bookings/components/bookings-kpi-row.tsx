import {
  AlertCircle,
  CalendarCheck,
  Calendar,
  UserX,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioBookingsKpis } from "../server/types";

const T = UI_TEXT.studioCabinet.bookingsV2.kpis;

type Tile = {
  icon: LucideIcon;
  label: string;
  value: string;
  sublabel: string;
};

function Card({ icon: Icon, label, value, sublabel }: Tile) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <span
        aria-hidden
        className="mb-2 inline-grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"
      >
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-xs text-text-sec">{label}</p>
      <p className="mt-0.5 font-display text-xl tabular-nums text-text-main">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-text-sec">{sublabel}</p>
    </div>
  );
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
      value: kpis.todayCount.toLocaleString("ru-RU"),
      sublabel: T.todayContext
        .replace("{completed}", String(kpis.todayCompleted))
        .replace("{upcoming}", String(kpis.todayUpcoming)),
    },
    {
      icon: AlertCircle,
      label: T.needsAction,
      value: kpis.needsActionCount.toLocaleString("ru-RU"),
      sublabel: T.needsActionContext.replace(
        "{count}",
        String(kpis.needsActionCount),
      ),
    },
    {
      icon: CalendarCheck,
      label: T.confirmed,
      value: kpis.confirmedNext7Days.toLocaleString("ru-RU"),
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
      value: kpis.noShowLast7Days.toLocaleString("ru-RU"),
      sublabel: T.noShowContext,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <Card key={tile.label} {...tile} />
      ))}
    </div>
  );
}
