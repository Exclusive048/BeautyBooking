import type { TopServiceItem } from "@/lib/master/analytics-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { formatRubles } from "./lib/format";

const T = UI_TEXT.cabinetMaster.analytics.topServices;

type Props = {
  services: TopServiceItem[] | null;
  periodLabel: string;
};

/**
 * Numbered list (01–06) of the master's top services by revenue.
 * Horizontal bar shows revenue share relative to the top item — gives
 * an at-a-glance read of "is this service carrying the practice or are
 * earnings spread evenly".
 */
export function TopServicesSection({ services, periodLabel }: Props) {
  if (!services || services.length === 0) {
    return (
      <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
        <Header periodLabel={periodLabel} />
        <div className="mt-4 rounded-xl border border-dashed border-border-subtle bg-bg-card/60 px-4 py-8 text-center">
          <p className="font-display text-base text-text-main">{T.emptyTitle}</p>
          <p className="mt-1 text-sm text-text-sec">{T.emptyBody}</p>
        </div>
      </section>
    );
  }

  const maxRevenue = services.reduce((max, item) => Math.max(max, item.revenue), 0) || 1;

  return (
    <section className="rounded-2xl border border-border-subtle bg-bg-card p-5">
      <Header periodLabel={periodLabel} />
      <ul className="mt-4 space-y-3">
        {services.map((service, index) => {
          const widthPct = Math.max(2, Math.round((service.revenue / maxRevenue) * 100));
          return (
            <li key={service.key}>
              <div className="flex items-baseline gap-2">
                <span className="w-6 shrink-0 font-mono text-[10px] text-text-sec">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 truncate text-sm text-text-main">
                  {service.label}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-text-sec">
                  · {service.bookings}
                </span>
                <span className="shrink-0 font-mono text-sm font-medium text-text-main">
                  {formatRubles(service.revenue)}
                </span>
              </div>
              <div className="mt-1 ml-8 h-1 overflow-hidden rounded-full bg-bg-input">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Header({ periodLabel }: { periodLabel: string }) {
  return (
    <div>
      <h2 className="font-display text-base text-text-main">{T.heading}</h2>
      <p className="mt-0.5 text-xs text-text-sec">
        {T.subtitleTemplate.replace("{period}", periodLabel)}
      </p>
    </div>
  );
}
