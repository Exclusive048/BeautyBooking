import { Calendar, CreditCard, Users, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { UI_TEXT } from "@/lib/ui/text";
import type {
  AdminKpi,
  AdminKpiKey,
} from "@/features/admin-cabinet/dashboard/types";

const T = UI_TEXT.adminPanel.dashboard.kpi;

const ICON: Record<AdminKpiKey, LucideIcon> = {
  registrations7d: Users,
  bookings1d: Calendar,
  activeSubs: CreditCard,
  revenueMonth: Wallet,
};

const LABEL: Record<AdminKpiKey, string> = {
  registrations7d: T.registrations7d,
  bookings1d: T.bookings1d,
  activeSubs: T.activeSubs,
  revenueMonth: T.revenueMonth,
};

/** Two of the four tiles get a brand-tinted icon plate to break up the
 * row visually, matching the reference's "burgundy / neutral" rhythm. */
const ICON_TINT: Record<AdminKpiKey, "brand" | "neutral"> = {
  registrations7d: "brand",
  bookings1d: "neutral",
  activeSubs: "neutral",
  revenueMonth: "brand",
};

type Props = {
  kpi: AdminKpi;
};

export function KpiCard({ kpi }: Props) {
  const Icon = ICON[kpi.key];
  const label = LABEL[kpi.key];
  const tint = ICON_TINT[kpi.key];

  return (
    <article className="rounded-2xl border border-border-subtle bg-bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <span
          aria-hidden
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-xl",
            tint === "brand"
              ? "bg-primary/10 text-primary"
              : "bg-bg-input text-text-sec",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <DeltaBadge kpi={kpi} />
      </div>
      <div className="font-display text-2xl font-semibold tabular-nums tracking-tight text-text-main md:text-3xl">
        {kpi.valueText}
      </div>
      <p className="mt-1 text-xs text-text-sec">{label}</p>
    </article>
  );
}

function DeltaBadge({ kpi }: { kpi: AdminKpi }) {
  if (kpi.deltaText === null || kpi.deltaSign === null) {
    return (
      <span
        className="font-mono text-[11px] text-text-sec"
        title={T.deltaUnavailable}
      >
        {T.deltaUnavailable}
      </span>
    );
  }
  const isPositive = kpi.deltaSign === "positive";
  const isZero = kpi.deltaSign === "zero";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold",
        isZero
          ? "bg-bg-input text-text-sec"
          : isPositive
            ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
            : "bg-red-500/12 text-red-600 dark:text-red-400",
      )}
      aria-label={
        isPositive ? T.deltaTooltipPositive : T.deltaTooltipNegative
      }
    >
      {!isZero ? (
        <span aria-hidden>{isPositive ? T.deltaUp : T.deltaDown}</span>
      ) : null}
      {kpi.deltaText}
    </span>
  );
}
