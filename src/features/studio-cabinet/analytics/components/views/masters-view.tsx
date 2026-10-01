import { Users } from "lucide-react";
import { FeatureGate } from "@/components/billing/FeatureGate";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import type { StudioAnalyticsViewData } from "../../lib/types";

const T = UI_TEXT.studioCabinet.analyticsV2.masters;

type Props = {
  data: StudioAnalyticsViewData;
};

/**
 * Masters analytics table. No «ВАМ» / payout column — payouts +
 * commission flows are intentionally absent from the studio cabinet
 * (cross-ref STUDIO-SERVICES-A). Studios see how each master performs;
 * commission math is a future feature.
 *
 * Occupancy column uses the same 5-slots/day heuristic as
 * STUDIO-DASHBOARD-A (cross-ref backlog item for precise slot-engine
 * integration).
 */
export function MastersView({ data }: Props) {
  const masters = data.masters;
  return (
    <FeatureGate scope="STUDIO" feature="analytics_revenue" available={data.features.revenue} description={UI_TEXT.cabinetMaster.analytics.lock.body}>
      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
        {!masters || masters.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Users className="h-10 w-10 text-text-sec/30" aria-hidden />
            <p className="text-base font-semibold text-text-main">{T.empty.title}</p>
            <p className="max-w-md text-sm text-text-sec">{T.empty.hint}</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-bg-input/40 eyebrow">
                <th className="px-3 py-2.5">{T.colMaster}</th>
                <th className="px-3 py-2.5 text-right">{T.colBookings}</th>
                <th className="px-3 py-2.5 text-right">{T.colRevenue}</th>
                <th className="px-3 py-2.5 text-right">{T.colAvgCheck}</th>
                <th className="px-3 py-2.5 text-right">{T.colOccupancy}</th>
                <th className="px-3 py-2.5 text-right">{T.colRating}</th>
              </tr>
            </thead>
            <tbody>
              {masters.map((row) => (
                <tr key={row.masterId} className="border-t border-border-subtle hover:bg-bg-input/30">
                  <td className="px-3 py-3 text-sm font-medium text-text-main">{row.masterName}</td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums text-text-main">
                    {row.bookings}
                  </td>
                  <td className="px-3 py-3 text-right font-display text-sm font-semibold tabular-nums text-text-main">
                    {UI_FMT.priceLabel(row.revenueKopeks)}
                  </td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums text-text-sec">
                    {row.avgCheckKopeks > 0 ? UI_FMT.priceLabel(row.avgCheckKopeks) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums text-text-sec">
                    {Math.round(row.occupancyRate * 100)}%
                  </td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums text-text-sec">
                    {row.reviewsCount > 0 ? `★ ${UI_FMT.decimal(row.rating, 1)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </FeatureGate>
  );
}
