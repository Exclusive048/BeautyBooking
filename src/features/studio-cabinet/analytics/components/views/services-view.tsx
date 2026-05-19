import { Package } from "lucide-react";
import { FeatureGate } from "@/features/master/components/analytics/feature-gate";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioAnalyticsViewData } from "../../lib/types";

const T = UI_TEXT.studioCabinet.analyticsV2.services;

type Props = {
  data: StudioAnalyticsViewData;
};

export function ServicesView({ data }: Props) {
  const services = data.services;
  return (
    <FeatureGate available={data.features.revenue}>
      <section className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
        {!services || services.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Package className="h-10 w-10 text-text-sec/30" aria-hidden />
            <p className="text-base font-semibold text-text-main">{T.empty.title}</p>
            <p className="max-w-md text-sm text-text-sec">{T.empty.hint}</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-bg-input/40 text-[10px] font-mono uppercase tracking-[0.12em] text-text-sec">
                <th className="px-3 py-2.5">{T.colService}</th>
                <th className="px-3 py-2.5 text-right">{T.colBookings}</th>
                <th className="px-3 py-2.5 text-right">{T.colRevenue}</th>
                <th className="px-3 py-2.5 text-right">{T.colShare}</th>
                <th className="px-3 py-2.5 text-right">{T.colMasters}</th>
              </tr>
            </thead>
            <tbody>
              {services.map((row) => (
                <tr key={row.serviceKey} className="border-t border-border-subtle hover:bg-bg-input/30">
                  <td className="px-3 py-3 text-sm font-medium text-text-main">{row.serviceName}</td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums text-text-main">
                    {row.bookings}
                  </td>
                  <td className="px-3 py-3 text-right font-display text-sm font-semibold tabular-nums text-text-main">
                    {UI_FMT.priceLabel(row.revenueKopeks)}
                  </td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums text-text-sec">
                    {Math.round(row.share * 100)}%
                  </td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums text-text-sec">
                    {row.mastersCount}
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
