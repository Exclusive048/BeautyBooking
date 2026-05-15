"use client";

import { ChartCard } from "@/features/admin-cabinet/dashboard/components/chart-card";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminChartSeries } from "@/features/admin-cabinet/dashboard/types";

type Props = {
  data: AdminChartSeries;
};

const T = UI_TEXT.adminPanel.dashboard.charts;

/** Bar chart wrapper: passes the series through to the shared
 * `<ChartCard>` with `variant="bars"`. */
export function RegistrationsChart({ data }: Props) {
  return (
    <ChartCard
      title={T.registrationsTitle}
      deltaSuffix={T.registrationsDeltaSuffix}
      data={data}
      variant="bars"
      tooltipNoun={T.tooltipRegistrations}
      ariaLabel={T.ariaLabelRegistrations}
    />
  );
}
