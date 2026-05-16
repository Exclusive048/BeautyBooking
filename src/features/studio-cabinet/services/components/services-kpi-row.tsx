import {
  Layers,
  TrendingUp,
  Wallet,
  UserMinus,
  type LucideIcon,
} from "lucide-react";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioServicesKpis } from "../lib/types";

const T = UI_TEXT.studioCabinet.servicesV2.kpis;

type Tile = {
  icon: LucideIcon;
  label: string;
  value: string;
  sublabel: string;
  warn?: boolean;
};

function Card({ icon: Icon, label, value, sublabel, warn }: Tile) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <span
        aria-hidden
        className={`mb-2 inline-grid h-8 w-8 place-items-center rounded-lg ${
          warn
            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
            : "bg-primary/10 text-primary"
        }`}
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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label} {...tile} />
      ))}
    </div>
  );
}
