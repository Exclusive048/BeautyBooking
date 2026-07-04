import { Crown, Heart, Moon, TrendingUp, Users } from "lucide-react";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioClientsKpis } from "../lib/types";

const T = UI_TEXT.studioCabinet.clientsV2.kpis;

type Props = {
  kpis: StudioClientsKpis;
};

export function ClientsKpiRow({ kpis }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Tile
        icon={<Users className="h-4 w-4" aria-hidden />}
        label={T.total}
        value={String(kpis.total.count)}
        sub={T.totalSub.replace("{count}", String(kpis.total.addedThisMonth))}
      />
      <Tile
        icon={<Heart className="h-4 w-4" aria-hidden />}
        label={T.active}
        value={String(kpis.active30d.count)}
        sub={T.activeSub.replace("{percent}", String(kpis.active30d.percentOfBase))}
      />
      <Tile
        icon={<TrendingUp className="h-4 w-4" aria-hidden />}
        label={T.avgLifetime}
        value={UI_FMT.priceLabel(kpis.avgLifetime.kopeks)}
        sub={T.avgLifetimeSub}
      />
      <Tile
        icon={<Crown className="h-4 w-4" aria-hidden />}
        label={T.vip}
        value={String(kpis.vip.count)}
        sub={T.vipSub.replace("{percent}", String(kpis.vip.revenuePercent))}
        accent
      />
      <Tile
        icon={<Moon className="h-4 w-4" aria-hidden />}
        label={T.sleeping}
        value={String(kpis.sleeping.count)}
        sub={T.sleepingSub}
      />
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card p-4">
      <div className="flex items-center gap-2 text-text-sec">
        <span
          className={
            accent
              ? "grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-accent-text"
              : "grid h-7 w-7 place-items-center rounded-lg bg-bg-input text-text-sec"
          }
        >
          {icon}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]">{label}</span>
      </div>
      <div className="mt-2 font-display text-xl font-bold tabular-nums text-text-main">{value}</div>
      <div className="mt-0.5 text-[11px] text-text-sec">{sub}</div>
    </div>
  );
}
