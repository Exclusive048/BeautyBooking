import { Users } from "lucide-react";
import { FeatureGate } from "@/components/billing/FeatureGate";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioAnalyticsViewData } from "../../lib/types";

const T = UI_TEXT.studioCabinet.analyticsV2.clients;

type Props = {
  data: StudioAnalyticsViewData;
};

/**
 * Clients view — segments breakdown + top 10 clients by lifetime
 * revenue. Cohort retention matrix is intentionally NOT surfaced here
 * (placeholder under FeatureGate for `cohorts` flag, body lives in
 * backlog for the deeper-analytics scope).
 */
export function ClientsView({ data }: Props) {
  const clients = data.clients;
  return (
    <FeatureGate scope="STUDIO" feature="analytics_clients" available={data.features.clients} description={UI_TEXT.cabinetMaster.analytics.lock.body}>
      <div className="space-y-4">
        <section className="rounded-2xl border border-border-subtle bg-bg-card p-4">
          <header className="mb-3">
            <h2 className="font-display text-base font-semibold text-text-main">
              {T.segmentsTitle}
            </h2>
            <p className="text-[11px] text-text-sec">{T.segmentsDesc}</p>
          </header>
          {clients && clients.segments.length > 0 ? (
            <ul className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {clients.segments.map((slice) => (
                <li
                  key={slice.key}
                  className="rounded-xl border border-border-subtle bg-bg-input/30 p-3"
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
                    {slice.label}
                  </p>
                  <p className="mt-1 font-display text-lg font-bold tabular-nums text-text-main">
                    {slice.count}
                  </p>
                  <p className="text-[11px] text-text-sec">{slice.percent}%</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-sec">{T.empty.hint}</p>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
          <header className="px-4 pt-4">
            <h2 className="font-display text-base font-semibold text-text-main">
              {T.topClientsTitle}
            </h2>
            <p className="text-[11px] text-text-sec">{T.topClientsDesc}</p>
          </header>
          {clients && clients.topClients.length > 0 ? (
            <table className="mt-3 w-full text-left">
              <thead>
                <tr className="bg-bg-input/40 text-[10px] font-mono uppercase tracking-[0.12em] text-text-sec">
                  <th className="px-3 py-2.5">{T.colClient}</th>
                  <th className="px-3 py-2.5 text-right">{T.colVisits}</th>
                  <th className="px-3 py-2.5 text-right">{T.colLifetime}</th>
                </tr>
              </thead>
              <tbody>
                {clients.topClients.map((row, index) => (
                  <tr key={row.clientKey} className="border-t border-border-subtle hover:bg-bg-input/30">
                    <td className="px-3 py-3 text-sm text-text-main">
                      <span className="font-mono text-xs text-text-sec">{index + 1}. </span>
                      {row.displayName}
                    </td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums text-text-sec">
                      {row.visitsCount}
                    </td>
                    <td className="px-3 py-3 text-right font-display text-sm font-semibold tabular-nums text-text-main">
                      {UI_FMT.priceLabel(row.lifetimeKopeks)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <Users className="h-10 w-10 text-text-sec/30" aria-hidden />
              <p className="text-base font-semibold text-text-main">{T.empty.title}</p>
              <p className="max-w-md text-sm text-text-sec">{T.empty.hint}</p>
            </div>
          )}
        </section>
      </div>
    </FeatureGate>
  );
}
