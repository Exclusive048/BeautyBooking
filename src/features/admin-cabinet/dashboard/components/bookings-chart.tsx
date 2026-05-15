"use client";

import { ChartCard } from "@/features/admin-cabinet/dashboard/components/chart-card";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminChartSeries } from "@/features/admin-cabinet/dashboard/types";

type Props = {
  data: AdminChartSeries;
};

const T = UI_TEXT.adminPanel.dashboard.charts;

/** Line chart wrapper — same `<ChartCard>` primitive with
 * `variant="line"`. Kept as a separate component so the dashboard
 * orchestrator can place them in different grid cells without
 * threading the variant through prop drilling. */
export function BookingsChart({ data }: Props) {
  return (
    <ChartCard
      title={T.bookingsTitle}
      deltaSuffix={T.bookingsDeltaSuffix}
      data={data}
      variant="line"
      tooltipNoun={T.tooltipBookings}
      ariaLabel={T.ariaLabelBookings}
    />
  );
}
