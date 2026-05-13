import { KpiCard } from "@/features/admin-cabinet/dashboard/components/kpi-card";
import type { AdminKpis } from "@/features/admin-cabinet/dashboard/types";

type Props = {
  data: AdminKpis;
};

/** 2×2 on mobile / phablet, 4 columns from `md` up. Mirrors the
 * proportions in the reference at desktop while staying readable on
 * a 360-wide viewport. */
export function KpiRow({ data }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
      {data.items.map((kpi) => (
        <KpiCard key={kpi.key} kpi={kpi} />
      ))}
    </div>
  );
}
